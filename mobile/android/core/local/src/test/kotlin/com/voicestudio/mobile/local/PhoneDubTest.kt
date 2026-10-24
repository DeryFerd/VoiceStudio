package com.voicestudio.mobile.local

import com.voicestudio.mobile.network.ClientFailure
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlin.math.*

class PhoneDubTest {
    @get:Rule val temporary=TemporaryFolder()
    private val models=listOf(fixtureModel("asr"),fixtureModel("translate"),fixtureModel("clone"))
    private val targets=listOf(DubTarget("fr","French"),DubTarget("de","German"))
    private val original=LocalAudio(FloatArray(72000) {.25f},24000)
    private var decodes=0
    private var exports=0
    private val decoder=object: AudioDecoder {
        override suspend fun decode(source: File,output: File,maxSeconds: Int,progress: (Float)->Unit): PcmFile {
            decodes++;writePcm(original,output);return PcmFile(output)
        }
    }
    private val media=object: DubMedia {
        override suspend fun finish(source: File,audio: PcmFile,markedWave: File,output: File,audioOnly: Boolean,progress: (Float)->Unit): File {
            exports++
            val result=File(output.path+".wav")
            Files.move(markedWave.toPath(),result.toPath(),StandardCopyOption.REPLACE_EXISTING);return result
        }
    }
    private fun store()=PhoneDubStore(File(temporary.root,"jobs"))
    private suspend fun request(store: PhoneDubStore,chosen: List<DubTarget> = targets,consent: Boolean = true): PhoneDubRequest {
        val source=File(temporary.root,"source.wav").apply {writeText("fixture media")}
        return store.create(source,"Source clip",chosen,models,consent)
    }
    private open class Engine: FakeLocalEngine() {
        var translated=0;var cloned=0;var transcribed=0
        override suspend fun transcribeSegments(model: PhoneModel,audio: LocalAudio,progress: (Float)->Unit): List<SpeechSegment> {
            transcribed++;return listOf(SpeechSegment(0.0,1.0,"First sentence"),SpeechSegment(2.0,3.0,"Second sentence"))
        }
        override suspend fun translate(model: PhoneModel,text: String,targetLanguage: String,progress: (Float)->Unit): String {translated++;return "$targetLanguage translation"}
        override suspend fun clone(model: PhoneModel,text: String,reference: LocalAudio,referenceText: String,progress: (Float)->Unit): LocalAudio {
            assertEquals(24000,reference.sampleRate);assertTrue(referenceText.isNotBlank());assertTrue(reference.samples.all {abs(it-.25f)<.0001})
            cloned++;return LocalAudio(FloatArray(12000) {.5f},24000)
        }
    }
    @Test fun offlinePipelineProducesMarkedAudioWithGapsAndDurableHistory()=runTest {
        val store=store();val request=request(store);val engine=Engine()
        val events=mutableListOf<DubProgress>()
        val pipeline=PhoneDubPipeline(store,engine,decoder,media)
        val result=pipeline.run(request.id,models,events::add)
        assertTrue(result.done);assertEquals(2,result.outputs.size)
        assertEquals(1,decodes);assertEquals(1,engine.transcribed);assertEquals(4,engine.translated);assertEquals(4,engine.cloned)
        val first=store.file(request.id,result.outputs.first().file)
        assertTrue(first.readBytes().toString(Charsets.ISO_8859_1).contains("VoiceStudio synthetic audio"))
        assertEquals(3.0,result.outputs.first().duration,0.0)
        assertEquals(listOf(request),store.list().map {it.request})
        assertEquals(100,events.last().percent)
        pipeline.run(request.id,models)
        assertEquals(4,engine.cloned);assertEquals(4,engine.translated);assertEquals(2,exports)
        store.delete(request.id);assertTrue(store.list().isEmpty())
    }
    @Test fun cancelledCloneResumesWithoutRetranslatingCompletedText()=runTest {
        val store=store();val request=request(store,targets.take(1))
        val engine=object: Engine() {
            var cancelled=false
            override suspend fun clone(model: PhoneModel,text: String,reference: LocalAudio,referenceText: String,progress: (Float)->Unit): LocalAudio {
                if(!cancelled) {cancelled=true;throw CancellationException("interrupted")}
                return super.clone(model,text,reference,referenceText,progress)
            }
        }
        val pipeline=PhoneDubPipeline(store,engine,decoder,media)
        try {pipeline.run(request.id,models);fail()} catch(_:CancellationException) {}
        val saved=store.checkpoint(request.id)
        assertEquals("French translation",saved.segments.first().translations["fr"]);assertEquals("First sentence",saved.segments.first().referenceText)
        assertFalse(saved.done)
        pipeline.run(request.id,models)
        assertEquals(2,engine.translated);assertEquals(2,engine.cloned);assertEquals(1,decodes);assertEquals(1,engine.transcribed)
    }
    @Test fun damagedRenderedSegmentIsRebuiltAndNeverMixedTwice()=runTest {
        val store=store();val request=request(store,targets.take(1))
        val engine=object: Engine() {
            var calls=0
            override suspend fun clone(model: PhoneModel,text: String,reference: LocalAudio,referenceText: String,progress: (Float)->Unit): LocalAudio {
                calls++;if(calls==2) throw CancellationException("after first segment")
                return super.clone(model,text,reference,referenceText,progress)
            }
        }
        val pipeline=PhoneDubPipeline(store,engine,decoder,media)
        try {pipeline.run(request.id,models);fail()} catch(_:CancellationException) {}
        assertEquals(1,store.checkpoint(request.id).renders.size)
        store.file(request.id,"render-0-0.pcm").writeText("damaged")
        pipeline.run(request.id,models)
        assertEquals(4,engine.calls);assertEquals(2,engine.translated)
    }
    @Test fun changedModelOrWithdrawnLicenceBlocksEvenCachedWork()=runTest {
        val store=store();val request=request(store)
        val engine=Engine()
        try {PhoneDubPipeline(store,engine,decoder,media).run(request.id,models.map {it.copy(revision="c".repeat(40))});fail()}
        catch(e:ClientFailure) {assertEquals("mobile.local.model_incompatible",e.key)}
        try {PhoneDubPipeline(store,engine,decoder,media) {throw ClientFailure("mobile.local.licence_required")}.run(request.id,models);fail()}
        catch(e:ClientFailure) {assertEquals("mobile.local.licence_required",e.key)}
        assertEquals(0,decodes);assertEquals(0,engine.cloned)
    }
    @Test fun noConsentNoSpeechAndMalformedCheckpointsFailClosed()=runTest {
        val store=store()
        try {request(store,consent=false);fail()} catch(_:IllegalArgumentException) {}
        assertTrue(store.list().isEmpty())
        val request=request(store)
        val silent=object: FakeLocalEngine() {override suspend fun transcribeSegments(model: PhoneModel,audio: LocalAudio,progress: (Float)->Unit)=emptyList<SpeechSegment>()}
        try {PhoneDubPipeline(store,silent,decoder,media).run(request.id,models);fail()} catch(e:ClientFailure) {assertEquals("mobile.simple.no_speech",e.key)}
        store.file(request.id,"checkpoint.json").writeText("not json")
        try {store.checkpoint(request.id);fail()} catch(e:ClientFailure) {assertEquals("mobile.simple.checkpoint_failed",e.key)}
    }
    @Test fun unreadableDubDoesNotHideHealthyJobs()=runTest {
        val store=store();val healthy=request(store);val broken=request(store)
        store.file(broken.id,"checkpoint.json").writeText("broken")
        assertEquals(listOf(healthy),store.list().map {it.request})
    }
    @Test fun blankReferenceTranscriptionFallsBackAndResumeUsesSavedText()=runTest {
        val store=store();val request=request(store,targets.take(1))
        val engine=object: Engine() {
            var referenceCalls=0;var interrupt=true
            override suspend fun transcribe(model: PhoneModel,audio: LocalAudio,progress: (Float)->Unit): String {referenceCalls++;return " "}
            override suspend fun clone(model: PhoneModel,text: String,reference: LocalAudio,referenceText: String,progress: (Float)->Unit): LocalAudio {
                assertEquals(if(cloned==0) "First sentence" else "Second sentence",referenceText)
                if(interrupt) {interrupt=false;throw CancellationException("resume")}
                return super.clone(model,text,reference,referenceText,progress)
            }
        }
        val pipeline=PhoneDubPipeline(store,engine,decoder,media)
        try {pipeline.run(request.id,models);fail()} catch(_:CancellationException) {}
        assertEquals("First sentence",store.checkpoint(request.id).segments.first().referenceText)
        assertTrue(pipeline.run(request.id,models).done)
        assertEquals("Whole-segment clips already have exact transcripts",0,engine.referenceCalls)
    }
    @Test fun blankTranscriptionOfShortenedReferenceUsesSegmentText()=runTest {
        val longDecoder=object: AudioDecoder {
            override suspend fun decode(source: File,output: File,maxSeconds: Int,progress: (Float)->Unit): PcmFile {
                writePcm(LocalAudio(FloatArray(24000*10) {.25f},24000),output);return PcmFile(output)
            }
        }
        val engine=object: Engine() {
            var referenceCalls=0
            override suspend fun transcribeSegments(model: PhoneModel,audio: LocalAudio,progress: (Float)->Unit)=listOf(SpeechSegment(0.0,10.0,"Long sentence"))
            override suspend fun transcribe(model: PhoneModel,audio: LocalAudio,progress: (Float)->Unit): String {referenceCalls++;return " "}
            override suspend fun clone(model: PhoneModel,text: String,reference: LocalAudio,referenceText: String,progress: (Float)->Unit): LocalAudio {
                assertEquals("Long sentence",referenceText);return super.clone(model,text,reference,referenceText,progress)
            }
        }
        val store=store();val request=request(store,targets.take(1))
        assertTrue(PhoneDubPipeline(store,engine,longDecoder,media).run(request.id,models).done)
        assertEquals(1,engine.referenceCalls)
        assertEquals("Long sentence",store.checkpoint(request.id).segments.single().referenceText)
    }
    @Test fun timingPadsSilenceAndCompressionPreservesPitch()=runTest {
        val padded=fitTiming(LocalAudio(floatArrayOf(.1f,.2f),24000),5)
        assertArrayEquals(floatArrayOf(.1f,.2f,0f,0f,0f),padded.samples,0f)
        val sine=LocalAudio(FloatArray(24000) {sin(2*PI*440*it/24000).toFloat()},24000)
        val fitted=fitTiming(sine,12000)
        val crossings=fitted.samples.indices.drop(1).count {fitted.samples[it-1]<0&&fitted.samples[it]>=0}
        assertEquals(12000,fitted.samples.size);assertEquals(220.0,crossings.toDouble(),15.0)
        assertTrue(fitted.samples.all {it.isFinite()&&abs(it)<=1})
    }
    @Test fun mixerKeepsGapsAndClampsOverlap()=runTest {
        val first=File(temporary.root,"first.pcm");writePcm(LocalAudio(FloatArray(2400) {.8f},24000),first)
        val mixed=mixTimeline(File(temporary.root,"mix.pcm"),7200,listOf(0L to PcmFile(first),0L to PcmFile(first),4800L to PcmFile(first)))
        val samples=mixed.read(0,7200).samples
        assertTrue(samples.take(2400).all {it==1f});assertTrue(samples.slice(2400 until 4800).all {it==0f});assertTrue(samples.drop(4800).all {it==.8f})
    }
}
