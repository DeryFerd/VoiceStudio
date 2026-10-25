package com.voicestudio.mobile.features

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.voicestudio.mobile.designsystem.*
import com.voicestudio.mobile.network.CommunityItem
import kotlinx.coroutines.*

@Composable fun GalleryScreen(vm: StudioViewModel,navigate: (String)->Unit) {
    val phone by vm.phone.state.collectAsState()
    val host by vm.state.collectAsState()
    val scope=rememberCoroutineScope()
    val context=LocalContext.current
    var location by rememberSaveable {mutableStateOf("phone")}
    var query by rememberSaveable {mutableStateOf("")}
    var items by remember(host.connectionId) {mutableStateOf(emptyList<CommunityItem>())}
    var total by remember(host.connectionId) {mutableStateOf(0)}
    var loading by remember {mutableStateOf(false)}
    var audio by remember(host.connectionId) {mutableStateOf<String?>(null)}
    suspend fun load() {
        val api=vm.api ?: return
        if(loading) return
        loading=true
        try {
            val page=api.community(items.size)
            if(vm.api===api) {items=items+page.items;total=page.total}
        } catch(e:CancellationException) {throw e} catch(e:Exception) {vm.fail(e)} finally {loading=false}
    }
    LaunchedEffect(location,host.connectionId) {if(location=="computer"&&items.isEmpty()) load() else vm.phone.refresh()}
    Screen {
        ScreenTitle("nav.gallery")
        ChoicePicker("mobile.local.run_on",location,listOf(Choice("phone",tr("mobile.local.this_phone")),Choice("computer",tr("mobile.local.my_computer")))) {location=it}
        Field("mobile.voices.search",query,{query=it})
        if(location=="phone") {
            phone.models.filter {it.capability=="tts"&&phone.canRun(it,vm.phone.ramBytes)&&(query.isBlank()||it.name.contains(query,true))}.forEach {model ->
                Text(model.name,style=MaterialTheme.typography.titleMedium)
                val speakers=model.option("num_speakers","1").toIntOrNull()?.coerceIn(1,128) ?: 1
                repeat(speakers) {speaker ->
                    TextButton(onClick={vm.run {
                        vm.store.update {it.copy(phoneModels=it.phoneModels+("speak" to model.id),runLocations=it.runLocations+("speak" to "phone"))}
                        navigate("preset/"+android.net.Uri.encode(model.id)+"/$speaker")
                    }}) {Text(tr("mobile.local.preset_voice",mapOf("number" to speaker+1)))}
                }
            }
            Secondary("mobile.local.models") {navigate("models")}
            Secondary("mobile.tabs.voices") {navigate("voices")}
        } else if(vm.api==null) Secondary("mobile.simple.reconnect") {navigate("connect")}
        else {
            Text(tr("gallery.community_explainer"),color=role("textMuted"))
            items.filter {query.isBlank()||it.name.contains(query,true)}.forEach {item ->
                Group {Column(Modifier.padding(VSTheme.inset)) {
                    Text(item.name,style=MaterialTheme.typography.titleMedium)
                    Text(listOfNotNull(item.author,item.license,item.language).joinToString(" · "),style=MaterialTheme.typography.bodySmall)
                    Secondary("common.play") {audio="/community/items/${com.voicestudio.mobile.network.VoiceStudioApi.segment(item.id)}/preview"}
                    Secondary("gallery.use_voice",!host.busy) {vm.run {
                        val api=vm.api ?: return@run
                        val saved=api.useCommunity(item.id)
                        if(vm.api===api) {vm.refreshVoiceLibrary();navigate("host-voice/"+android.net.Uri.encode(saved.profile_id))}
                    }}
                }}
            }
            if(items.isEmpty()&&!loading) EmptyState("gallery.community_empty")
            if(items.size<total) Secondary("common.more_info",!loading) {scope.launch {load()}}
            if(loading) InlineLoading()
            audio?.let {path ->vm.api?.let {HostPlayer(it,path,vm::fail)}}
        }
    }
}
