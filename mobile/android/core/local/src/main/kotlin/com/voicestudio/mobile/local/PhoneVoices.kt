package com.voicestudio.mobile.local

import com.voicestudio.mobile.network.ClientFailure
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID

internal val LocalJson=Json {ignoreUnknownKeys=true}
internal fun atomicText(file: File, text: String) {
    file.parentFile!!.mkdirs()
    val pending=File(file.parentFile,file.name+".pending")
    java.io.FileOutputStream(pending).use {it.write(text.toByteArray(Charsets.UTF_8));it.fd.sync()}
    Files.move(pending.toPath(),file.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)
}
/** [modelRepo]/[modelRevision] name the model that made the voice, for reports; older voices have none. */
@Serializable data class PhoneVoice(val id: String, val name: String, val transcript: String, val createdAt: Long, val consentAt: Long, val sampleRate: Int = 24000,
    val modelRepo: String? = null, val modelRevision: String? = null, val designInstruction: String? = null, val designSeed: Long? = null)
/** One atomic metadata publication after ASR + reference writes. No user paths. */
class PhoneVoiceStore(private val root: File) {
    private val mutex=Mutex()
    private fun directory(id: String): File {
        require(runCatching {UUID.fromString(id).toString()==id}.getOrDefault(false))
        return File(root,id)
    }
    suspend fun list(): List<PhoneVoice> = withContext(Dispatchers.IO) {mutex.withLock {
        root.listFiles().orEmpty().filter {it.isDirectory&&!it.name.startsWith('.')}.mapNotNull {dir ->
            val metadata=File(dir,"voice.json")
            if(!metadata.exists()) return@mapNotNull null
            try {
                val voice=LocalJson.decodeFromString<PhoneVoice>(metadata.readText())
                directory(voice.id)
                require(voice.id==dir.name&&voice.sampleRate==24000&&voice.transcript.isNotBlank()&&voice.name.isNotBlank())
                require(File(dir,"reference.pcm").length() in 9600..2_880_000)
                voice
            } catch(e:CancellationException) {throw e} catch(_:Exception) {null}
        }.sortedByDescending {it.createdAt}
    }}
    suspend fun create(name: String, source: File, consent: Boolean, asr: PhoneModel, cloneModel: PhoneModel, engine: LocalEngine,
        decoder: AudioDecoder = AndroidAudioDecoder(), progress: (Float)->Unit = {}): PhoneVoice = withContext(Dispatchers.IO) {
        require(consent&&asr.capability=="asr"&&cloneModel.capability=="clone"&&name.trim().isNotEmpty()&&name.length<=200)
        val id=UUID.randomUUID().toString()
        val dir=directory(id).apply {mkdirs()}
        try {
            val audio=decoder.decode(source,File(dir,"reference.pcm"),30) {progress(it*.25f)}
            val transcript=engine.transcribe(asr,audio.read(0,audio.frames.toInt())) {progress(.25f+it*.25f)}.trim()
            if(transcript.isEmpty()) throw ClientFailure("mobile.simple.no_speech")
            writeReferenceWave(audio.read(0,audio.frames.toInt()),File(dir,"reference.wav"))
            val preview=engine.clone(cloneModel,transcript,audio.read(0,audio.frames.toInt()),transcript) {progress(.5f+it*.5f)}
            require(preview.sampleRate>0&&preview.samples.isNotEmpty()&&preview.samples.all {it.isFinite()})
            markSynthetic(preview,File(dir,"preview.wav"))
            currentCoroutineContext().ensureActive()
            val now=System.currentTimeMillis()
            val voice=PhoneVoice(id,name.trim(),transcript,now,now,modelRepo=cloneModel.repo,modelRevision=cloneModel.revision)
            mutex.withLock {atomicText(File(dir,"voice.json"),LocalJson.encodeToString(PhoneVoice.serializer(),voice))}
            progress(1f);voice
        } catch(e:Throwable) {dir.deleteRecursively();throw e}
    }
    suspend fun saveDesign(name: String,text: String,audio: LocalAudio,model: PhoneModel,instruction: String,seed: Long): PhoneVoice = withContext(Dispatchers.IO) {mutex.withLock {
        require(name.isNotBlank()&&name.length<=200&&text.isNotBlank()&&audio.sampleRate==24000&&audio.samples.size in 2400..720000&&audio.samples.all {it.isFinite()}&&seed>=0)
        val id=UUID.randomUUID().toString();val dir=directory(id).apply {mkdirs()}
        try {
            writePcm(audio,File(dir,"reference.pcm"));markSynthetic(audio,File(dir,"reference.wav"))
            currentCoroutineContext().ensureActive()
            val now=System.currentTimeMillis()
            val voice=PhoneVoice(id,name.trim(),text,now,now,modelRepo=model.repo,modelRevision=model.revision,designInstruction=instruction,designSeed=seed)
            atomicText(File(dir,"voice.json"),LocalJson.encodeToString(PhoneVoice.serializer(),voice));voice
        } catch(e:Throwable) {dir.deleteRecursively();throw e}
    }}
    fun preview(voice: PhoneVoice): File = File(directory(voice.id),"preview.wav").takeIf {it.isFile} ?: File(directory(voice.id),"reference.wav")
    suspend fun reference(voice: PhoneVoice): LocalAudio = withContext(Dispatchers.IO) {mutex.withLock {
        val audio=PcmFile(File(directory(voice.id),"reference.pcm"),voice.sampleRate)
        require(audio.frames in 2400..720000);audio.read(0,audio.frames.toInt())
    }}
    suspend fun rename(voice: PhoneVoice, name: String) = withContext(Dispatchers.IO) {mutex.withLock {
        require(name.trim().isNotEmpty()&&name.length<=200)
        val file=File(directory(voice.id),"voice.json")
        val current=LocalJson.decodeFromString<PhoneVoice>(file.readText())
        atomicText(file,LocalJson.encodeToString(PhoneVoice.serializer(),current.copy(name=name.trim())))
    }}
    suspend fun delete(voice: PhoneVoice) = withContext(Dispatchers.IO) {mutex.withLock {
        if(!directory(voice.id).deleteRecursively()) throw ClientFailure("mobile.simple.clone_failed")
    }}
}
