package com.voicestudio.mobile

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.voicestudio.mobile.local.*
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.flow.toList
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Build here; the maintainer runs on arm64 devices and an x86_64 emulator. */
@RunWith(AndroidJUnit4::class)
class LocalInferenceTest {
    @Test fun allPinnedNativeLibrariesLoadTogether() = runBlocking {
        val runtimes=verifyNativeRuntimes()
        assertEquals(setOf("sherpa-onnx","omnivoice.cpp","llama.cpp"),runtimes.keys)
        assertEquals(2,runtimes.getValue("omnivoice.cpp"))
        assertTrue(runtimes.getValue("llama.cpp")>0)
    }
    /** Explicit test invocation is the only network trigger; repeat runs use
     * verified app-private cache. No inference test quietly downloads on launch. */
    @Test fun smallestModelsProduceSpeechAndRecognizeItOffline() = runBlocking {
        val arguments=InstrumentationRegistry.getArguments()
        assumeTrue(arguments.getString("localInferenceSmoke")=="true")
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val catalogue=context.assets.open("models.json").bufferedReader().use {ModelCatalog.decode(it.readText())}
        val tts=catalogue.models.filter {it.capability=="tts"}.minBy {it.totalBytes}
        val asr=catalogue.models.filter {it.capability=="asr"}.minBy {it.totalBytes}
        val stream=catalogue.models.first {it.capability=="asr-stream"}
        val ram=android.app.ActivityManager.MemoryInfo().also {context.getSystemService(android.app.ActivityManager::class.java).getMemoryInfo(it)}.totalMem
        assumeTrue(listOf(tts,asr,stream).all {it.fits(ram)})
        val directory=File(context.noBackupFilesDir,"inference-smoke")
        val gate=LicenceGate(File(directory,"licences.json"),BuildConfig.VERSION_NAME)
        for(model in listOf(tts,asr,stream)) {
            if(model.gated) {
                assertEquals("Pass acceptModelLicencesForSmoke=true only after reviewing the bundled terms", "true",arguments.getString("acceptModelLicencesForSmoke"))
                gate.record(model,true)
            }
        }
        val downloads=ModelDownloads(File(directory,"models"),gate,ram) {true}
        if(arguments.getString("downloadSmokeModels")=="true") {
            for(model in listOf(tts,asr,stream)) downloads.download(model,false)
        }
        for(model in listOf(tts,asr,stream)) assertTrue("Explicitly provision the smoke models before offline inference",downloads.installed(model))
        // From this point neither engine nor model loads have a network path.
        val engine=PhoneLocalEngine(downloads)
        val audio=engine.synthesize(tts,"The quick brown fox jumps over the lazy dog.",language="en")
        assertTrue(audio.samples.size>audio.sampleRate)
        assertTrue(audio.samples.any {kotlin.math.abs(it)>.001f})
        val recognized=engine.transcribe(asr,audio).lowercase()
        assertTrue(recognized,recognized.contains("fox"))
        val chunks=audio.samples.toList().chunked(audio.sampleRate/10).map {LocalAudio(it.toFloatArray(),audio.sampleRate)}
        val live=engine.streamTranscribe(stream,chunks.asFlow()).toList()
        assertTrue(live.isNotEmpty());assertTrue(live.last().final);assertTrue(live.last().text.isNotBlank())
    }
    @Test fun phoneVoiceUsesRealDecoderWhisperAndOmniVoice() = runBlocking {
        val args=InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("cloneInferenceSmoke")=="true")
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val catalog=context.assets.open("models.json").bufferedReader().use {ModelCatalog.decode(it.readText())}
        val tts=catalog.models.filter {it.capability=="tts"}.minBy {it.totalBytes}
        val asr=catalog.models.filter {it.capability=="asr"}.minBy {it.totalBytes}
        val clone=catalog.models.first {it.capability=="clone"}
        val ram=android.app.ActivityManager.MemoryInfo().also {context.getSystemService(android.app.ActivityManager::class.java).getMemoryInfo(it)}.totalMem
        assumeTrue(listOf(tts,asr,clone).all {it.fits(ram)})
        val root=File(context.noBackupFilesDir,"clone-smoke").apply {mkdirs()}
        val gate=LicenceGate(File(root,"licences.json"),BuildConfig.VERSION_NAME)
        for(model in listOf(tts,asr,clone)) if(model.gated) {
            assertEquals("Review the exact terms first","true",args.getString("acceptModelLicencesForSmoke"));gate.record(model,true)
        }
        val downloads=ModelDownloads(File(root,"models"),gate,ram) {true}
        if(args.getString("downloadSmokeModels")=="true") for(model in listOf(tts,asr,clone)) downloads.download(model,false)
        for(model in listOf(tts,asr,clone)) assertTrue(downloads.installed(model))
        val engine=PhoneLocalEngine(downloads)
        val source=File(root,"reference.wav");markSynthetic(engine.synthesize(tts,"The quick brown fox jumps over the lazy dog.",language="en"),source)
        val store=PhoneVoiceStore(File(root,"voices"))
        val voice=store.create("Test voice",source,true,asr,clone,engine)
        try {
            assertTrue(voice.transcript.isNotBlank())
            val audio=engine.clone(clone,"Hello from this phone.",store.reference(voice),voice.transcript)
            assertEquals(24000,audio.sampleRate);assertTrue(audio.samples.any {kotlin.math.abs(it)>.001f})
            store.rename(voice,"Renamed");assertEquals("Renamed",store.list().first {it.id==voice.id}.name)
        } finally {store.delete(voice);source.delete()}
    }

}
