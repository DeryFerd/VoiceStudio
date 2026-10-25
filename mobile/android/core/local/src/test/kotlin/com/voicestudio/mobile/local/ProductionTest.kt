package com.voicestudio.mobile.local

import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder

class ProductionTest {
    @get:Rule val temporary = TemporaryFolder()
    @Test fun chaptersCastAndInferenceBounds() {
        val plan = ProductionPlan.parse("# Arrival\n[voice:Alice] Hello there.\nStill Alice.\n# Return\n[voice:Bob] Welcome back.\n" + "word ".repeat(250))
        assertEquals(listOf("Alice", "Bob"), plan.roles)
        assertEquals(listOf("Arrival", "Return"), plan.chapters)
        assertEquals("Alice", plan.segments[1].role)
        val unicode=ProductionPlan.parse("😀".repeat(401));assertTrue(unicode.segments.all {it.text.length<=400});assertEquals("😀".repeat(401),unicode.segments.joinToString("") {it.text})
        assertTrue(plan.segments.all { it.text.isNotBlank() && it.text.length <= 400 })
        assertThrows(IllegalArgumentException::class.java) { ProductionPlan.parse("# Empty") }
    }
    @Test fun restartResumesAndVoiceOrModelChangesInvalidateOutput() = runTest {
        val root = File(temporary.root, "production")
        val store = ProductionStore(root)
        var project = ProductionProject(kind="stories", title="A story", script="[voice:Alice] Hello\n[voice:Bob] World", defaultVoice="alice", cast=mapOf("Bob" to "bob"))
        store.save(project)
        var calls=0
        var interrupt=true
        val synthesize: suspend (ProductionSegment, String)->LocalAudio = { _, voice ->
            calls++
            if(calls==2 && interrupt) throw CancellationException()
            LocalAudio(FloatArray(2400) {if(voice=="alice") .2f else .4f},24000)
        }
        try {store.render(project,"model-v1",synthesize=synthesize);fail()} catch(_:CancellationException) {}
        assertNull(store.output(project,"model-v1"))
        interrupt=false
        val restarted=ProductionStore(root)
        val output=restarted.render(project,"model-v1",synthesize=synthesize)
        assertEquals(3,calls)
        assertEquals("RIFF",output.readBytes().take(4).toByteArray().toString(Charsets.US_ASCII))
        assertTrue(output.readBytes().toString(Charsets.US_ASCII).contains("VoiceStudio synthetic audio"))
        assertEquals(listOf(project.id),restarted.list().map {it.id})
        project=project.copy(cast=mapOf("Bob" to "alice"))
        assertNull(restarted.output(project,"model-v1"))
        restarted.render(project,"model-v1",synthesize=synthesize)
        assertEquals(4,calls)
        assertNull(restarted.output(project,"model-v2"))
    }
    @Test fun conversionFitsDurationAndSilenceNeverSynthesizes() = runTest {
        val root=File(temporary.root,"conversion")
        val voices=PhoneVoiceStore(File(root,"voices"))
        var silent=false;var clones=0
        val engine=object: FakeLocalEngine() {
            override suspend fun transcribe(model: PhoneModel,audio: LocalAudio,progress: (Float)->Unit)=if(silent) " " else "A real transcript"
            override suspend fun clone(model: PhoneModel,text: String,reference: LocalAudio,referenceText: String,progress: (Float)->Unit): LocalAudio {
                clones++;assertEquals("A real transcript",text);assertEquals("A real transcript",referenceText)
                return LocalAudio(FloatArray(12000) {.2f},24000)
            }
        }
        val decoder=object: AudioDecoder {
            override suspend fun decode(source: File,output: File,maxSeconds: Int,progress: (Float)->Unit): PcmFile {
                assertEquals(30,maxSeconds);writePcm(LocalAudio(FloatArray(24000) {.1f},24000),output);return PcmFile(output)
            }
        }
        val voice=voices.create("Voice",root,true,fixtureModel(),fixtureModel("clone"),engine,decoder)
        val workspace=File(root,"work")
        val result=VoiceConversion.run(root,workspace,voice,voices,fixtureModel(),fixtureModel("clone"),engine,decoder,matchDuration=true)
        assertEquals("A real transcript",result.transcript);assertEquals(24000,result.audio.samples.size)
        assertTrue(workspace.listFiles().orEmpty().isEmpty())
        silent=true
        try {VoiceConversion.run(root,workspace,voice,voices,fixtureModel(),fixtureModel("clone"),engine,decoder,matchDuration=false);fail()}
        catch(e:com.voicestudio.mobile.network.ClientFailure) {assertEquals("mobile.simple.no_speech",e.key)}
        assertEquals(2,clones)
    }
}
