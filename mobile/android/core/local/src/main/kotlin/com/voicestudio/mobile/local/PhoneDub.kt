package com.voicestudio.mobile.local

import com.voicestudio.mobile.network.ClientFailure
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.UUID

@Serializable data class DubTarget(val code: String,val name: String)
@Serializable data class DubModelPin(val id: String,val identity: String)
@Serializable data class PhoneDubRequest(val id: String,val title: String,val sourceFile: String,val targets: List<DubTarget>,
    val models: List<DubModelPin>,val createdAt: Long,val consentAt: Long,val referenceText: String? = null,val audioOnly: Boolean = false)
@Serializable data class DubSegmentState(val speech: SpeechSegment,val referenceText: String? = null,val translations: Map<String,String> = emptyMap())
@Serializable data class DubRender(val index: Int,val sha256: String,val frames: Long)
@Serializable data class PhoneDubOutput(val language: String,val name: String,val file: String,val sha256: String,val duration: Double)
@Serializable data class PhoneDubCheckpoint(val frames: Long = 0,val nextFrame: Long = 0,val segments: List<DubSegmentState> = emptyList(),
    val renders: List<DubRender> = emptyList(),val outputs: List<PhoneDubOutput> = emptyList(),val stage: String = "mobile.android.stage_prepare",val percent: Int = 0,val done: Boolean = false,val errorParams: Map<String,String> = emptyMap())
data class PhoneDubRecord(val request: PhoneDubRequest,val checkpoint: PhoneDubCheckpoint)
data class DubProgress(val stage: String,val percent: Int)
fun modelPin(model: PhoneModel): DubModelPin {
    val bytes=LocalJson.encodeToString(PhoneModel.serializer(),model).toByteArray()
    return DubModelPin(model.id,MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") {"%02x".format(it)})
}
/** App-private jobs contain source, immutable model identities and atomic checkpoints. */
class PhoneDubStore(private val root: File) {
    fun directory(id: String): File {
        require(runCatching {UUID.fromString(id).toString()==id}.getOrDefault(false))
        return File(root,id)
    }
    fun file(id: String, name: String): File {
        require(name.matches(Regex("[A-Za-z0-9_.-]+"))&&name !in setOf(".",".."))
        return File(directory(id),name)
    }
    suspend fun create(source: File,title: String,targets: List<DubTarget>,models: List<PhoneModel>,consent: Boolean,
        reference: LocalAudio? = null,referenceText: String? = null,audioOnly: Boolean = false): PhoneDubRequest = withContext(Dispatchers.IO) {
        require(consent&&targets.isNotEmpty()&&targets.size<=20&&targets.map {it.code}.distinct().size==targets.size)
        require(targets.all {it.code.matches(Regex("[A-Za-z0-9_-]{1,80}"))&&it.name.length in 2..120&&it.name.none(Char::isISOControl)})
        require(models.size==3&&models.map {it.capability}.toSet()==setOf("asr","translate","clone"))
        require((reference==null)==(referenceText==null)&&referenceText?.isBlank()!=true)
        val id=UUID.randomUUID().toString();val dir=directory(id).apply {mkdirs()}
        try {
            if(dir.usableSpace<source.length()+16_000_000) throw ClientFailure("mobile.local.storage_required")
            val extension=source.extension.takeIf {it.matches(Regex("[A-Za-z0-9]{1,10}"))} ?: "media"
            val sourceName="source.$extension"
            source.inputStream().use {input -> file(id,sourceName).outputStream().use {out ->
                val bytes=ByteArray(262144)
                while(true) {currentCoroutineContext().ensureActive();val count=input.read(bytes);if(count<0) break;out.write(bytes,0,count)}
                out.fd.sync()
            }}
            if(reference!=null) {require(reference.sampleRate==24000);writePcm(reference,file(id,"voice-reference.pcm"))}
            val now=System.currentTimeMillis()
            val request=PhoneDubRequest(id,title.take(250),sourceName,targets,models.map(::modelPin),now,now,referenceText,audioOnly)
            save(id,PhoneDubCheckpoint())
            atomicText(file(id,"request.json"),LocalJson.encodeToString(PhoneDubRequest.serializer(),request));request
        } catch(e:Throwable) {dir.deleteRecursively();throw e}
    }
    suspend fun request(id: String): PhoneDubRequest = withContext(Dispatchers.IO) {
        try {LocalJson.decodeFromString<PhoneDubRequest>(file(id,"request.json").readText()).also {require(it.id==id);file(id,it.sourceFile)}}
        catch(e:CancellationException) {throw e} catch(e:Exception) {throw ClientFailure("mobile.simple.checkpoint_failed")}
    }
    suspend fun checkpoint(id: String): PhoneDubCheckpoint = withContext(Dispatchers.IO) {
        try {LocalJson.decodeFromString<PhoneDubCheckpoint>(file(id,"checkpoint.json").readText())}
        catch(e:CancellationException) {throw e} catch(e:Exception) {throw ClientFailure("mobile.simple.checkpoint_failed")}
    }
    suspend fun save(id: String,value: PhoneDubCheckpoint) = withContext(Dispatchers.IO) {
        try {atomicText(file(id,"checkpoint.json"),LocalJson.encodeToString(PhoneDubCheckpoint.serializer(),value))}
        catch(e:CancellationException) {throw e} catch(e:Exception) {throw ClientFailure("mobile.simple.checkpoint_failed")}
    }
    suspend fun list(): List<PhoneDubRecord> = withContext(Dispatchers.IO) {
        root.listFiles().orEmpty().filter {File(it,"request.json").exists()}.mapNotNull {
            currentCoroutineContext().ensureActive()
            try {PhoneDubRecord(request(it.name),checkpoint(it.name))}
            catch(e:CancellationException) {throw e} catch(_:Exception) {null}
        }.sortedByDescending {it.request.createdAt}
    }
    /**
     * Serialises everything that writes one job (a running worker, its cancel cleanup, a resumed worker,
     * deletion). WorkManager reports a cancelled job finished before its native call has returned, so
     * the lock, not WorkInfo, is what makes resume and delete wait for the old run to finish saving.
     */
    suspend fun <T> exclusive(id: String,block: suspend ()->T): T {
        val key=directory(id).absolutePath
        return locks.getOrPut(key) {Mutex()}.withLock {block()}
    }
    suspend fun delete(id: String) = exclusive(id) {withContext(Dispatchers.IO) {if(!directory(id).deleteRecursively()) throw ClientFailure("mobile.simple.checkpoint_failed")}}
    private companion object {val locks=java.util.concurrent.ConcurrentHashMap<String,Mutex>()}
}
interface DubMedia {
    /** Returns the output file; a video export replaces its original soundtrack. */
    suspend fun finish(source: File,audio: PcmFile,markedWave: File,output: File,audioOnly: Boolean,progress: (Float)->Unit = {}): File
}
/** No network API exists here. Every native call passes through LocalEngine. */
class PhoneDubPipeline(private val store: PhoneDubStore,private val engine: LocalEngine,private val decoder: AudioDecoder = AndroidAudioDecoder(),
    private val media: DubMedia = AndroidDubMedia(),private val authorize: ()->Unit = {}) {
    suspend fun run(id: String,models: List<PhoneModel>,report: (DubProgress)->Unit = {}): PhoneDubCheckpoint = withContext(Dispatchers.IO) {
        val request=store.request(id)
        if(request.models.toSet()!=models.map(::modelPin).toSet()) throw ClientFailure("mobile.local.model_incompatible")
        val asr=models.single {it.capability=="asr"};val translator=models.single {it.capability=="translate"};val clone=models.single {it.capability=="clone"}
        var checkpoint=store.checkpoint(id)
        suspend fun save(value: PhoneDubCheckpoint) {authorize();currentCoroutineContext().ensureActive();store.save(id,value);checkpoint=value}
        suspend fun stage(key: String,percent: Int) {save(checkpoint.copy(stage=key,percent=percent,errorParams=emptyMap()));report(DubProgress(key,percent))}
        fun nativeProgress(key: String,base: Int,span: Int): (Float)->Unit = {value ->report(DubProgress(key,(base+value.coerceIn(0f,1f)*span).toInt().coerceIn(0,99)))}
        if(checkpoint.done&&checkpoint.outputs.size==request.targets.size&&checkpoint.outputs.all {output ->
            val file=store.file(id,output.file);file.exists()&&sha256(file)==output.sha256
        }) {report(DubProgress("mobile.android.stage_done",100));return@withContext checkpoint}
        if(checkpoint.done) throw ClientFailure("mobile.simple.media_failed")
        authorize()
        val source=store.file(id,request.sourceFile)
        val original=store.file(id,"original.pcm")
        if(checkpoint.frames==0L||original.length()!=checkpoint.frames*4) {
            // An interrupted extraction is discarded; a checkpoint is published only after fsync.
            stage("mobile.android.stage_prepare",0)
            val decoded=decoder.decode(source,original,14400,nativeProgress("mobile.android.stage_prepare",0,10))
            save(checkpoint.copy(frames=decoded.frames,nextFrame=0,segments=emptyList(),renders=emptyList(),outputs=emptyList(),done=false))
        }
        val pcm=PcmFile(original)
        val window=24000*20L
        while(checkpoint.nextFrame<pcm.frames) {
            currentCoroutineContext().ensureActive();authorize()
            val start=checkpoint.nextFrame
            val count=minOf(window,pcm.frames-start).toInt()
            stage("mobile.android.stage_transcribe",10+(start.toDouble()/pcm.frames*25).toInt())
            val audio=pcm.read(start,count)
            val segments=if(count<2400||audio.samples.none {kotlin.math.abs(it)>.001f}) emptyList() else engine.transcribeSegments(asr,audio)
            val offset=start.toDouble()/24000
            val duration=count.toDouble()/24000
            require(segments.all {it.start.isFinite()&&it.end.isFinite()&&it.start>=0&&it.end>it.start&&it.end<=duration+.01&&it.text.isNotBlank()})
            val absolute=segments.map {DubSegmentState(it.copy(start=offset+it.start,end=minOf(pcm.duration,offset+it.end)))}
            save(checkpoint.copy(nextFrame=start+count,segments=checkpoint.segments+absolute))
        }
        if(checkpoint.segments.isEmpty()) throw ClientFailure("mobile.simple.no_speech")
        require(checkpoint.segments.size<=10000)
        for(targetIndex in checkpoint.outputs.size until request.targets.size) {
            val target=request.targets[targetIndex]
            val needed=pcm.frames*12+source.length()+16_000_000
            if(store.directory(id).usableSpace<needed) throw ClientFailure("mobile.local.storage_required")
            fun targetPercent(fraction: Double)=(35+(targetIndex+fraction)/request.targets.size*65).toInt().coerceIn(35,99)
            for(index in checkpoint.segments.indices) {
                currentCoroutineContext().ensureActive();authorize()
                val base=targetPercent(index.toDouble()/checkpoint.segments.size*.85)
                var segment=checkpoint.segments[index]
                if(segment.translations[target.code].isNullOrBlank()) {
                    stage("mobile.android.stage_translate",base)
                    val translated=engine.translate(translator,segment.speech.text,target.name,nativeProgress("mobile.android.stage_translate",base,1)).trim()
                    if(translated.isBlank()) throw ClientFailure("mobile.android.translation_failed")
                    segment=segment.copy(translations=segment.translations+(target.code to translated))
                    save(checkpoint.copy(segments=checkpoint.segments.toMutableList().also {it[index]=segment}))
                }
                val start=(segment.speech.start*24000).toLong()
                val end=minOf(pcm.frames,(segment.speech.end*24000).toLong())
                val frames=(end-start).toInt().coerceAtLeast(1)
                val rendered=store.file(id,"render-$targetIndex-$index.pcm")
                val previous=checkpoint.renders.firstOrNull {it.index==index}
                if(previous!=null&&previous.frames==frames.toLong()&&rendered.length()==frames*4L&&sha256(rendered)==previous.sha256) continue
                stage("mobile.android.stage_render",base)
                val duration=segment.speech.end-segment.speech.start
                // A saved text equal to the segment's own transcript means recognition of the 8 s clip came back
                // blank: the reference is then the whole segment, so a resumed job pairs the same audio with the same words.
                val wholeSegment=request.referenceText==null&&duration>8.0&&!segment.referenceText.isNullOrBlank()&&segment.referenceText==segment.speech.text
                var reference=if(request.referenceText!=null) {
                    val saved=PcmFile(store.file(id,"voice-reference.pcm"));saved.read(0,saved.frames.toInt())
                } else pcm.clip(segment.speech.start,if(wholeSegment) segment.speech.end else minOf(segment.speech.end,segment.speech.start+8.0))
                val referenceText=request.referenceText ?: segment.referenceText?.takeIf {it.isNotBlank()} ?: run {
                    val recognized=if(duration<=8.0) segment.speech.text else engine.transcribe(asr,reference).trim()
                    val text=recognized.ifBlank {
                        // Quiet or short clip: use the whole segment with its own transcript, never a clip with someone else's words.
                        reference=pcm.clip(segment.speech.start,segment.speech.end)
                        segment.speech.text
                    }
                    segment=segment.copy(referenceText=text)
                    save(checkpoint.copy(segments=checkpoint.segments.toMutableList().also {it[index]=segment}))
                    text
                }
                val generated=engine.clone(clone,requireNotNull(segment.translations[target.code]),reference,referenceText,nativeProgress("mobile.android.stage_render",base,1))
                val fitted=fitTiming(generated,frames)
                val pending=File(rendered.parentFile,rendered.name+".pending")
                writePcm(fitted,pending);currentCoroutineContext().ensureActive();authorize()
                Files.move(pending.toPath(),rendered.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)
                val render=DubRender(index,sha256(rendered),frames.toLong())
                save(checkpoint.copy(renders=checkpoint.renders.filterNot {it.index==index}+render))
            }
            stage("mobile.simple.mixing",targetPercent(.9))
            val mixed=mixTimeline(store.file(id,"mix.pcm"),pcm.frames,checkpoint.segments.mapIndexed {index,segment ->
                (segment.speech.start*24000).toLong() to PcmFile(store.file(id,"render-$targetIndex-$index.pcm"))
            })
            val wave=store.file(id,"marked.wav")
            markSynthetic(mixed,wave)
            stage("mobile.simple.exporting",targetPercent(.95))
            val result=media.finish(source,mixed,wave,store.file(id,"output-$targetIndex"),request.audioOnly,nativeProgress("mobile.simple.exporting",targetPercent(.95),maxOf(1,targetPercent(1.0)-targetPercent(.95))))
            authorize();currentCoroutineContext().ensureActive()
            require(result.parentFile.canonicalFile==store.directory(id).canonicalFile&&result.isFile)
            val output=PhoneDubOutput(target.code,target.name,result.name,sha256(result),pcm.duration)
            save(checkpoint.copy(outputs=checkpoint.outputs+output,renders=emptyList()))
            checkpoint.segments.indices.forEach {store.file(id,"render-$targetIndex-$it.pcm").delete()}
            mixed.file.delete();if(result!=wave) wave.delete()
        }
        save(checkpoint.copy(stage="mobile.android.stage_done",percent=100,done=true))
        original.delete();source.delete();store.file(id,"voice-reference.pcm").delete()
        report(DubProgress(checkpoint.stage,100));checkpoint
    }
}
