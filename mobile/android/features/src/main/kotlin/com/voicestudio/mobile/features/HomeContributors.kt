package com.voicestudio.mobile.features

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.voicestudio.mobile.designsystem.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.ceil
import kotlin.math.min

/**
 * Human GitHub contributors with more than 10 commits, mirroring
 * `electron/src/renderer/src/features/home/home-contributors-data.ts`. Avatars are copied from
 * Electron's bundle into the APK assets at build time: nothing is fetched at runtime.
 */
object HomeContributors {
    val logins = listOf("debpalash", "kevin9327", "psiberfunk", "velixio", "jaketame", "paoloantinori", "Chang-Jin-Lee", "Shivendra-Coherent", "marreiradigital")
    val coreMaintainers = setOf("debpalash", "velixio")
    const val REPOSITORY = "https://github.com/debpalash/VoiceStudio"
    /** Three right-aligned rows that taper downward, filled right to left, ending with "All". */
    fun rows(items: List<String>): List<List<String>> {
        val top = min(items.size, ceil((items.size + 3) / 3.0).toInt())
        val middle = min(items.size - top, ceil((items.size - top + 1) / 2.0).toInt())
        return listOf(items.subList(0, top), items.subList(top, top + middle), items.subList(top + middle, items.size)).filter { it.isNotEmpty() }
    }
}

@Composable fun ContributorCluster() {
    val items = HomeContributors.logins + "all"
    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        HomeContributors.rows(items).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { row.reversed().forEach { Contributor(it) } }
        }
    }
}

/** Keep the complete contributor list reachable without a three-row Home banner. */
@Composable fun ContributorStrip() {
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(4.dp),verticalAlignment=Alignment.CenterVertically) {
        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(4.dp)) {
            HomeContributors.logins.forEach {Contributor(it,compact=true)}
        }
        Contributor("all",compact=true)
    }
}

@Composable private fun Contributor(login: String, compact: Boolean = false) {
    val uri = LocalUriHandler.current
    val context = LocalContext.current
    val all = login == "all"
    val maintainer = login in HomeContributors.coreMaintainers
    val maintainerLabel = if(maintainer) tr("homeUi.coreMaintainer") else null
    val label = if (all) tr("homeUi.allContributors") else "@$login"
    val avatar by produceState<ImageBitmap?>(null, login) {
        if (!all) value = withContext(Dispatchers.IO) {
            val name = context.assets.list("contributors")?.firstOrNull { it.substringBeforeLast('.') == login } ?: return@withContext null
            context.assets.open("contributors/$name").use { BitmapFactory.decodeStream(it)?.asImageBitmap() }
        }
    }
    Box(Modifier.size(if(compact) 48.dp else 34.dp)
        .clickable(onClickLabel=label) {uri.openUri(if(all) "${HomeContributors.REPOSITORY}/graphs/contributors" else "https://github.com/$login")}
        .semantics {contentDescription=label;if(maintainerLabel!=null) stateDescription=maintainerLabel},contentAlignment=Alignment.Center) {
        Box(Modifier.size(if(compact) 28.dp else 34.dp)) {
            Box(Modifier.matchParentSize().clip(CircleShape).background(role("surfaceRaised"))
                .border(1.dp,role("border"),CircleShape),contentAlignment=Alignment.Center) {
                if(all) Text(tr("homeUi.all"),style=MaterialTheme.typography.labelSmall,fontWeight=FontWeight.SemiBold)
                else avatar?.let {Image(it,null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)}
            }
            if(maintainer) Box(Modifier.align(Alignment.BottomEnd).size(12.dp).clip(CircleShape)
                .background(role("messageAction")).border(1.5.dp,role("canvas"),CircleShape),contentAlignment=Alignment.Center) {
                Icon(Icons.Default.Star,null,Modifier.size(7.dp),tint=role("messageActionForeground"))
            }
        }
    }
}
