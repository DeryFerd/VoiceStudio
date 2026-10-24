#include "VSNative.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdatomic.h>
#include <dlfcn.h>
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE && (!__has_include("generated/c-api.h") || !__has_include("generated/omnivoice.h") || !__has_include("generated/llama.h"))
#error "Prepare all pinned runtimes with mobile/native/ios/build.sh ios before building the app"
#endif
struct VSCancel { atomic_int cancelled; _Atomic(float) progress; };
VSCancel *vs_cancel_create(void) {
    VSCancel *value=calloc(1,sizeof(VSCancel));
    if(value) { atomic_init(&value->cancelled,0); atomic_init(&value->progress,0); }
    return value;
}
void vs_cancel_set(VSCancel *v) { if(v) atomic_store(&v->cancelled, 1); }
int vs_cancelled(VSCancel *v) { return v && atomic_load(&v->cancelled); }
float vs_progress(VSCancel *v) { return v ? atomic_load(&v->progress) : 0; }
void vs_cancel_free(VSCancel *v) { free(v); }
void vs_audio_free(VSAudio *a) { free(a->samples); memset(a, 0, sizeof(*a)); }
void vs_text_free(char *text) { free(text); }
void vs_segments_free(VSSegments *out) {
    if (!out) return;
    for(int32_t i=0;i<out->count;++i) free(out->segments[i].text);
    free(out->segments); memset(out,0,sizeof(*out));
}
static int audio_copy(VSAudio *out, const float *samples, int n, int rate) {
    if (!samples || n <= 0 || rate <= 0) return -3;
    out->samples = malloc((size_t)n * sizeof(float));
    if (!out->samples) return -3;
    memcpy(out->samples, samples, (size_t)n * sizeof(float)); out->count = n; out->sample_rate = rate; return 0;
}
#if TARGET_OS_IPHONE
#define RESOLVE(handle, name) __typeof__(&name) p_##name = &name
#else
#define RESOLVE(handle, name) __typeof__(&name) p_##name = (__typeof__(&name))dlsym(handle, #name)
#endif
#if __has_include("generated/c-api.h")
#include "generated/c-api.h"
static int32_t tts_progress(const float *samples, int32_t n, float progress, void *arg) {
    VSCancel *token = arg; if (token) atomic_store(&token->progress, progress); return !vs_cancelled(token);
}
static void *sherpa_open(const char *path) {
#if TARGET_OS_IPHONE
    return (void *)1;
#else
    return path && *path ? dlopen(path, RTLD_NOW | RTLD_LOCAL) : NULL;
#endif
}
static void sherpa_close(void *handle) {
#if !TARGET_OS_IPHONE
    if(handle) dlclose(handle);
#endif
}
int vs_synthesize(const VSConfig *c, const char *text, int32_t speaker, float speed, VSCancel *cancel, VSAudio *out) {
    if(vs_cancelled(cancel)) return -4;
    void *lib = sherpa_open(c->library); if(!lib) return -1;
    RESOLVE(lib, SherpaOnnxCreateOfflineTts); RESOLVE(lib, SherpaOnnxDestroyOfflineTts);
    RESOLVE(lib, SherpaOnnxOfflineTtsGenerateWithConfig); RESOLVE(lib, SherpaOnnxDestroyOfflineTtsGeneratedAudio);
    if(!p_SherpaOnnxCreateOfflineTts || !p_SherpaOnnxDestroyOfflineTts || !p_SherpaOnnxOfflineTtsGenerateWithConfig || !p_SherpaOnnxDestroyOfflineTtsGeneratedAudio) { sherpa_close(lib); return -1; }
    SherpaOnnxOfflineTtsConfig cfg = {0}; cfg.model.num_threads=c->threads; cfg.model.provider="cpu"; cfg.max_num_sentences=1; cfg.silence_scale=0.2f; cfg.rule_fsts=c->rule_fsts;
    if(!strcmp(c->family,"kitten")) {
        cfg.model.kitten.model=c->model; cfg.model.kitten.voices=c->voices; cfg.model.kitten.tokens=c->tokens; cfg.model.kitten.data_dir=c->data_dir; cfg.model.kitten.length_scale=1;
    } else if(!strcmp(c->family,"kokoro")) {
        cfg.model.kokoro.model=c->model; cfg.model.kokoro.voices=c->voices; cfg.model.kokoro.tokens=c->tokens; cfg.model.kokoro.data_dir=c->data_dir; cfg.model.kokoro.lexicon=c->lexicon; cfg.model.kokoro.lang=c->language; cfg.model.kokoro.length_scale=1;
    } else { sherpa_close(lib); return -2; }
    const SherpaOnnxOfflineTts *tts=p_SherpaOnnxCreateOfflineTts(&cfg);
    if(!tts) { sherpa_close(lib); return -3; }
    SherpaOnnxGenerationConfig gen={0}; gen.sid=speaker; gen.speed=speed; gen.silence_scale=0.2f;
    const SherpaOnnxGeneratedAudio *a = vs_cancelled(cancel) ? NULL : p_SherpaOnnxOfflineTtsGenerateWithConfig(tts,text,&gen,tts_progress,cancel);
    int rc = vs_cancelled(cancel) ? -4 : a ? audio_copy(out,a->samples,a->n,a->sample_rate) : -3;
    if(a) p_SherpaOnnxDestroyOfflineTtsGeneratedAudio(a);
    p_SherpaOnnxDestroyOfflineTts(tts); sherpa_close(lib); return rc;
}
static int transcribe_impl(const VSConfig *c, const float *samples, int32_t n, int32_t rate, VSCancel *cancel, char **text, VSSegments *segments) {
    if(vs_cancelled(cancel)) return -4;
    void *lib=sherpa_open(c->library); if(!lib) return -1;
    RESOLVE(lib,SherpaOnnxCreateOfflineRecognizer); RESOLVE(lib,SherpaOnnxDestroyOfflineRecognizer);
    RESOLVE(lib,SherpaOnnxCreateOfflineStream); RESOLVE(lib,SherpaOnnxDestroyOfflineStream);
    RESOLVE(lib,SherpaOnnxAcceptWaveformOffline); RESOLVE(lib,SherpaOnnxDecodeOfflineStream);
    RESOLVE(lib,SherpaOnnxGetOfflineStreamResult); RESOLVE(lib,SherpaOnnxDestroyOfflineRecognizerResult);
    if(!p_SherpaOnnxCreateOfflineRecognizer || !p_SherpaOnnxDestroyOfflineRecognizer || !p_SherpaOnnxCreateOfflineStream || !p_SherpaOnnxDestroyOfflineStream || !p_SherpaOnnxAcceptWaveformOffline || !p_SherpaOnnxDecodeOfflineStream || !p_SherpaOnnxGetOfflineStreamResult || !p_SherpaOnnxDestroyOfflineRecognizerResult) { sherpa_close(lib); return -1; }
    SherpaOnnxOfflineRecognizerConfig cfg={0}; cfg.feat_config.sample_rate=16000; cfg.feat_config.feature_dim=80;
    cfg.model_config.num_threads=c->threads; cfg.model_config.provider="cpu"; cfg.model_config.tokens=c->tokens;
    cfg.model_config.whisper.encoder=c->encoder; cfg.model_config.whisper.decoder=c->decoder; cfg.model_config.whisper.language=c->language; cfg.model_config.whisper.task="transcribe"; cfg.model_config.whisper.tail_paddings=-1;
    cfg.model_config.whisper.enable_token_timestamps=segments ? 1 : 0;
    cfg.decoding_method="greedy_search";
    const SherpaOnnxOfflineRecognizer *recognizer=p_SherpaOnnxCreateOfflineRecognizer(&cfg);
    if(!recognizer) { sherpa_close(lib); return -3; }
    int rc=0;
    char *combined=calloc(1,1); size_t length=0;
    if(!combined || rate<=0) rc=-3;
    // Whisper's context is 30 seconds. Reuse its weights, with one bounded stream per window.
    for(int64_t offset=0; rc==0 && offset<n; offset+=(int64_t)rate*20) {
        if(vs_cancelled(cancel)) { rc=-4; break; }
        int32_t count=(int32_t)((n-offset)<(int64_t)rate*20 ? (n-offset) : (int64_t)rate*20);
        const SherpaOnnxOfflineStream *stream=p_SherpaOnnxCreateOfflineStream(recognizer);
        if(!stream) { rc=-3; break; }
        p_SherpaOnnxAcceptWaveformOffline(stream,rate,samples+offset,count);
        p_SherpaOnnxDecodeOfflineStream(recognizer,stream);
        const SherpaOnnxOfflineRecognizerResult *r=p_SherpaOnnxGetOfflineStreamResult(stream);
        if(r && r->text) {
            size_t size=strlen(r->text);
            if(segments && size) {
                // Window-relative token timing goes to Swift, which splits the window at pauses.
                // Without aligned tokens and timestamps the window is one untimed segment (token=0).
                int aligned=r->timestamps && r->tokens_arr && r->count>0;
                int32_t emit=aligned ? r->count : 1;
                VSSegment *grown=realloc(segments->segments,(size_t)(segments->count+emit)*sizeof(VSSegment));
                if(!grown) rc=-3;
                else {
                    segments->segments=grown;
                    for(int32_t i=0;i<emit && rc==0;++i) {
                        VSSegment *segment=&segments->segments[segments->count];
                        segment->window=(int32_t)(offset/((int64_t)rate*20)); segment->token=aligned ? 1 : 0;
                        segment->start=aligned ? r->timestamps[i] : 0;
                        segment->end=aligned && r->durations ? r->timestamps[i]+r->durations[i] : 0;
                        segment->text=strdup(aligned ? r->tokens_arr[i] : r->text);
                        if(!segment->text) rc=-3; else segments->count++;
                    }
                }
            }
            char *next=realloc(combined,length+size+2);
            if(!next) rc=-3;
            else {
                combined=next;
                if(length && size) combined[length++]=' ';
                memcpy(combined+length,r->text,size+1); length+=size;
            }
        } else rc=-3;
        if(r) p_SherpaOnnxDestroyOfflineRecognizerResult(r);
        p_SherpaOnnxDestroyOfflineStream(stream);
        if(cancel) atomic_store(&cancel->progress,(float)(offset+count)/(float)n);
    }
    if(rc==0) *text=combined; else free(combined);
    p_SherpaOnnxDestroyOfflineRecognizer(recognizer); sherpa_close(lib);
    return vs_cancelled(cancel) ? -4 : rc;
}
int vs_transcribe(const VSConfig *c,const float *samples,int32_t n,int32_t rate,VSCancel *cancel,char **text) {
    return transcribe_impl(c,samples,n,rate,cancel,text,NULL);
}
int vs_transcribe_segments(const VSConfig *c,const float *samples,int32_t n,int32_t rate,VSCancel *cancel,VSSegments *segments) {
    char *text=NULL; int rc=transcribe_impl(c,samples,n,rate,cancel,&text,segments); free(text); return rc;
}
struct VSStream { void *lib; const SherpaOnnxOnlineRecognizer *recognizer; const SherpaOnnxOnlineStream *stream; int32_t sample_rate; };
VSStream *vs_stream_create(const VSConfig *c) {
    void *lib=sherpa_open(c->library); if(!lib) return NULL;
    RESOLVE(lib,SherpaOnnxCreateOnlineRecognizer); RESOLVE(lib,SherpaOnnxCreateOnlineStream);
    if(!p_SherpaOnnxCreateOnlineRecognizer || !p_SherpaOnnxCreateOnlineStream) { sherpa_close(lib); return NULL; }
    SherpaOnnxOnlineRecognizerConfig cfg={0}; cfg.feat_config.sample_rate=16000; cfg.feat_config.feature_dim=80;
    cfg.model_config.transducer.encoder=c->encoder; cfg.model_config.transducer.decoder=c->decoder; cfg.model_config.transducer.joiner=c->joiner;
    cfg.model_config.tokens=c->tokens; cfg.model_config.provider="cpu"; cfg.model_config.num_threads=c->threads; cfg.model_config.model_type=c->family;
    cfg.decoding_method="greedy_search"; cfg.enable_endpoint=1; cfg.rule1_min_trailing_silence=2.4; cfg.rule2_min_trailing_silence=1.2; cfg.rule3_min_utterance_length=20;
    VSStream *s=calloc(1,sizeof(*s)); if(!s) { sherpa_close(lib); return NULL; } s->lib=lib;
    s->recognizer=p_SherpaOnnxCreateOnlineRecognizer(&cfg);
    if(s->recognizer) s->stream=p_SherpaOnnxCreateOnlineStream(s->recognizer);
    if(!s->stream) { vs_stream_free(s); return NULL; } return s;
}
int vs_stream_accept(VSStream *s, const float *samples, int32_t n, int32_t rate, int finished, VSCancel *cancel, char **text, int *endpoint) {
    if(vs_cancelled(cancel)) return -4;
    void *lib=s->lib;
    RESOLVE(lib,SherpaOnnxOnlineStreamAcceptWaveform); RESOLVE(lib,SherpaOnnxOnlineStreamInputFinished);
    RESOLVE(lib,SherpaOnnxIsOnlineStreamReady); RESOLVE(lib,SherpaOnnxDecodeOnlineStream);
    RESOLVE(lib,SherpaOnnxGetOnlineStreamResult); RESOLVE(lib,SherpaOnnxDestroyOnlineRecognizerResult);
    RESOLVE(lib,SherpaOnnxOnlineStreamIsEndpoint); RESOLVE(lib,SherpaOnnxOnlineStreamReset);
    if(!p_SherpaOnnxOnlineStreamAcceptWaveform || !p_SherpaOnnxOnlineStreamInputFinished || !p_SherpaOnnxIsOnlineStreamReady || !p_SherpaOnnxDecodeOnlineStream || !p_SherpaOnnxGetOnlineStreamResult || !p_SherpaOnnxDestroyOnlineRecognizerResult || !p_SherpaOnnxOnlineStreamIsEndpoint || !p_SherpaOnnxOnlineStreamReset) return -1;
    if(n>0) {
        if(s->sample_rate && s->sample_rate != rate) return -2;
        s->sample_rate=rate;
        p_SherpaOnnxOnlineStreamAcceptWaveform(s->stream,rate,samples,n);
    }
    if(finished) {
        int input_rate=s->sample_rate ? s->sample_rate : 16000;
        if(input_rate<8000 || input_rate>192000) return -2;
        float tail[57600]={0}; p_SherpaOnnxOnlineStreamAcceptWaveform(s->stream,input_rate,tail,input_rate*3/10); p_SherpaOnnxOnlineStreamInputFinished(s->stream);
    }
    while(p_SherpaOnnxIsOnlineStreamReady(s->recognizer,s->stream)) { if(vs_cancelled(cancel)) return -4; p_SherpaOnnxDecodeOnlineStream(s->recognizer,s->stream); }
    const SherpaOnnxOnlineRecognizerResult *r=p_SherpaOnnxGetOnlineStreamResult(s->recognizer,s->stream);
    if(r && r->text) *text=strdup(r->text);
    if(r) p_SherpaOnnxDestroyOnlineRecognizerResult(r);
    *endpoint=finished || p_SherpaOnnxOnlineStreamIsEndpoint(s->recognizer,s->stream);
    if(*endpoint && !finished) p_SherpaOnnxOnlineStreamReset(s->recognizer,s->stream);
    return *text ? 0 : -3;
}
void vs_stream_free(VSStream *s) {
    if(!s) return;
    RESOLVE(s->lib,SherpaOnnxDestroyOnlineStream); RESOLVE(s->lib,SherpaOnnxDestroyOnlineRecognizer);
    if(s->stream && p_SherpaOnnxDestroyOnlineStream) p_SherpaOnnxDestroyOnlineStream(s->stream);
    if(s->recognizer && p_SherpaOnnxDestroyOnlineRecognizer) p_SherpaOnnxDestroyOnlineRecognizer(s->recognizer);
    sherpa_close(s->lib); free(s);
}
#else
int vs_synthesize(const VSConfig *c,const char *t,int32_t s,float speed,VSCancel *v,VSAudio *a) { return -1; }
int vs_transcribe(const VSConfig *c,const float *s,int32_t n,int32_t r,VSCancel *v,char **t) { return -1; }
int vs_transcribe_segments(const VSConfig *c,const float *s,int32_t n,int32_t r,VSCancel *v,VSSegments *out) { return -1; }
VSStream *vs_stream_create(const VSConfig *c) { return NULL; }
int vs_stream_accept(VSStream *s,const float *a,int32_t n,int32_t r,int f,VSCancel *v,char **t,int *e) { return -1; }
void vs_stream_free(VSStream *s) {}
#endif

#if __has_include("generated/omnivoice.h")
#include "generated/omnivoice.h"
static bool ov_cancel(void *arg) { return vs_cancelled(arg); }
int vs_clone(const VSConfig *c,const char *text,const char *ref_text,const float *reference,int32_t n,VSCancel *cancel,VSAudio *out) {
#if TARGET_OS_IPHONE
    void *lib=(void *)1;
#else
    void *lib=dlopen(c->library,RTLD_NOW|RTLD_LOCAL); if(!lib) return -1;
#endif
    RESOLVE(lib,ov_init_default_params); RESOLVE(lib,ov_init); RESOLVE(lib,ov_tts_default_params); RESOLVE(lib,ov_synthesize); RESOLVE(lib,ov_audio_free); RESOLVE(lib,ov_free);
    int rc=-1;
    if(p_ov_init_default_params && p_ov_init && p_ov_tts_default_params && p_ov_synthesize && p_ov_audio_free && p_ov_free) {
        struct ov_init_params init; p_ov_init_default_params(&init); init.model_path=c->model; init.codec_path=c->codec;
        struct ov_context *ctx=vs_cancelled(cancel) ? NULL : p_ov_init(&init);
        if(ctx) {
            struct ov_tts_params params; p_ov_tts_default_params(&params); params.text=text; params.lang=c->language;
            params.ref_audio_24k=reference; params.ref_n_samples=n; params.ref_text=ref_text; params.cancel=ov_cancel; params.cancel_user_data=cancel;
            struct ov_audio a={0}; int result=p_ov_synthesize(ctx,&params,&a);
            rc=result == OV_STATUS_CANCELLED ? -4 : result == 0 ? audio_copy(out,a.samples,a.n_samples,a.sample_rate) : -3;
            p_ov_audio_free(&a); p_ov_free(ctx);
        } else rc=-3;
    }
#if !TARGET_OS_IPHONE
    dlclose(lib);
#endif
    return vs_cancelled(cancel) ? -4 : rc;
}
#else
int vs_clone(const VSConfig *c,const char *t,const char *rt,const float *r,int32_t n,VSCancel *v,VSAudio *a) { return -1; }
#endif

#if __has_include("generated/llama.h")
#include "generated/llama.h"
static bool llama_abort(void *arg) { return vs_cancelled(arg); }
int vs_translate(const VSConfig *c,const char *prompt,int32_t max_tokens,VSCancel *cancel,char **text) {
#if TARGET_OS_IPHONE
    void *lib=(void *)1;
#else
    void *lib=dlopen(c->library,RTLD_NOW|RTLD_LOCAL); if(!lib) return -1;
#endif
    RESOLVE(lib,llama_backend_init);
    RESOLVE(lib,llama_model_default_params); RESOLVE(lib,llama_model_load_from_file); RESOLVE(lib,llama_model_free);
    RESOLVE(lib,llama_context_default_params); RESOLVE(lib,llama_init_from_model); RESOLVE(lib,llama_free);
    RESOLVE(lib,llama_model_get_vocab); RESOLVE(lib,llama_tokenize); RESOLVE(lib,llama_batch_get_one); RESOLVE(lib,llama_decode);
    RESOLVE(lib,llama_sampler_chain_default_params); RESOLVE(lib,llama_sampler_chain_init); RESOLVE(lib,llama_sampler_chain_add);
    RESOLVE(lib,llama_sampler_init_greedy); RESOLVE(lib,llama_sampler_sample); RESOLVE(lib,llama_sampler_free);
    RESOLVE(lib,llama_vocab_is_eog); RESOLVE(lib,llama_token_to_piece);
    int rc=-1;
    if(!p_llama_backend_init || !p_llama_model_default_params || !p_llama_model_load_from_file || !p_llama_model_free || !p_llama_context_default_params || !p_llama_init_from_model || !p_llama_free || !p_llama_model_get_vocab || !p_llama_tokenize || !p_llama_batch_get_one || !p_llama_decode || !p_llama_sampler_chain_default_params || !p_llama_sampler_chain_init || !p_llama_sampler_chain_add || !p_llama_sampler_init_greedy || !p_llama_sampler_sample || !p_llama_sampler_free || !p_llama_vocab_is_eog || !p_llama_token_to_piece) goto done;
    p_llama_backend_init();
    struct llama_model_params mp=p_llama_model_default_params();
#if TARGET_OS_IPHONE && !TARGET_OS_SIMULATOR
    mp.n_gpu_layers=99;
#else
    mp.n_gpu_layers=0;
#endif
    struct llama_model *model=p_llama_model_load_from_file(c->model,mp); if(!model) { rc=-3; goto done; }
    struct llama_context_params cp=p_llama_context_default_params(); cp.n_ctx=2048; cp.n_batch=2048; cp.n_threads=c->threads; cp.n_threads_batch=c->threads; cp.abort_callback=llama_abort; cp.abort_callback_data=cancel;
    struct llama_context *ctx=p_llama_init_from_model(model,cp);
    if(!ctx) { p_llama_model_free(model); rc=-3; goto done; }
    const struct llama_vocab *vocab=p_llama_model_get_vocab(model);
    llama_token tokens[2048]; int count=p_llama_tokenize(vocab,prompt,(int)strlen(prompt),tokens,2048,true,true);
    rc=-2;
    if(count>0 && count+max_tokens<=2048) {
        struct llama_sampler *sampler=p_llama_sampler_chain_init(p_llama_sampler_chain_default_params());
        p_llama_sampler_chain_add(sampler,p_llama_sampler_init_greedy());
        char *output=calloc((size_t)max_tokens*512+1,1); size_t length=0; rc=output ? 0 : -3;
        struct llama_batch batch=p_llama_batch_get_one(tokens,count);
        for(int i=0; rc==0 && i<max_tokens; ++i) {
            if(vs_cancelled(cancel)) { rc=-4; break; }
            if(p_llama_decode(ctx,batch)!=0) { rc=-3; break; }
            llama_token token=p_llama_sampler_sample(sampler,ctx,-1);
            if(p_llama_vocab_is_eog(vocab,token)) break;
            char piece[512]; int size=p_llama_token_to_piece(vocab,token,piece,512,0,true);
            if(size<0) { rc=-3; break; }
            memcpy(output+length,piece,(size_t)size); length+=(size_t)size;
            tokens[0]=token; batch=p_llama_batch_get_one(tokens,1);
            if(cancel) atomic_store(&cancel->progress,(float)(i+1)/(float)max_tokens);
        }
        if(rc==0) *text=output; else free(output);
        p_llama_sampler_free(sampler);
    }
    p_llama_free(ctx); p_llama_model_free(model);
done:
#if !TARGET_OS_IPHONE
    dlclose(lib);
#endif
    return vs_cancelled(cancel) ? -4 : rc;
}
#else
int vs_translate(const VSConfig *c,const char *p,int32_t n,VSCancel *v,char **text) { return -1; }
#endif
int vs_runtime_available(const char *runtime,const char *library) {
#if TARGET_OS_IPHONE
#if __has_include("generated/c-api.h") && __has_include("generated/omnivoice.h") && __has_include("generated/llama.h")
    return 1;
#else
    return 0;
#endif
#else
    if(!library || !*library) return 0;
    void *lib=dlopen(library,RTLD_NOW|RTLD_LOCAL); if(!lib) return 0;
    const char *symbol=!strcmp(runtime,"sherpa-onnx") ? "SherpaOnnxCreateOfflineTts" : !strcmp(runtime,"omnivoice.cpp") ? "ov_init" : "llama_model_load_from_file";
    int result=dlsym(lib,symbol)!=NULL; dlclose(lib); return result;
#endif
}
