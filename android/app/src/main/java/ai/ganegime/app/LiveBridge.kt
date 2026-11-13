package ai.ganegime.app

import android.app.AlertDialog
import android.text.InputType
import android.webkit.JavascriptInterface
import android.widget.EditText
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Kakao credentials live only in the cloud. Service access stays in app-private storage. */
class LiveBridge(private val activity:MainActivity) {
    private val workers=Executors.newFixedThreadPool(2)
    private val endpoint="https://ganegime-cloud-api.dylanjang03.chatgpt.site"
    private val reviewEndpoint="https://ganegime-review-access.dylanjang03.chatgpt.site"
    @Volatile private var closed=false
    private var configuration:AlertDialog?=null
    fun dismissConfiguration(){configuration?.dismiss();configuration=null}
    @JavascriptInterface fun configure() {
        activity.runOnUiThread {
            if(closed || !activity.inputAllowed())return@runOnUiThread
            val input=EditText(activity).apply {
                hint="심사용 또는 개인 접속 코드"
                inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                setSingleLine(true)
            }
            val dialog=AlertDialog.Builder(activity).setTitle("클라우드 서버 연결")
                .setMessage("받은 접속 코드를 처음 한 번 저장하세요. 심사용 코드는 review-로 시작합니다. 카카오 API 키를 입력하는 곳이 아닙니다.")
                .setView(input).setNegativeButton("취소",null).setPositiveButton("저장",null).create()
            dialog.setOnShowListener {dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if(!activity.inputAllowed()){dialog.dismiss();return@setOnClickListener}
                val token=input.text.toString().trim()
                if(token.length !in 32..4096 || token.any {it.isWhitespace() || it.code<33 || it.code>126}){
                    input.error="발급받은 접속 코드를 확인해 주세요."
                } else {
                    try {
                        File(activity.filesDir,"cloud-backend.json").writeText(JSONObject().put("token",token).toString())
                        dialog.dismiss()
                        activity.web.evaluateJavascript("window.onCloudConfigured && window.onCloudConfigured()",null)
                    }catch(_:Exception){input.error="저장하지 못했어요. 다시 시도해 주세요."}
                }
            }}
            configuration=dialog;dialog.show()
        }
    }
    @JavascriptInterface fun request(id:String,action:String,payload:String) {
        if(closed || !id.matches(Regex("[A-Za-z0-9_-]{1,80}")))return
        if(action!="status" && !activity.inputAllowed()) {reply(id,false,JSONObject().put("error","PARK_REQUIRED").put("message","주차 후 다시 시도해 주세요."));return}
        if(action !in listOf("status","search","plan") || payload.toByteArray(Charsets.UTF_8).size>48000){reply(id,false,JSONObject().put("message","지원하지 않는 요청입니다."));return}
        workers.execute {
            if(action!="status" && !activity.inputAllowed()) {reply(id,false,JSONObject().put("error","PARK_REQUIRED").put("message","주차 후 다시 시도해 주세요."));return@execute}
            try {
                val f=File(activity.filesDir,"cloud-backend.json")
                if(!f.exists()){reply(id,false,JSONObject().put("error","NOT_CONFIGURED").put("message","설정 → 서버 연결 설정에서 접속 코드를 처음 한 번 저장해 주세요."));return@execute}
                val token=JSONObject(f.readText()).getString("token")
                val review=token.startsWith("review-")
                val base=if(review)reviewEndpoint else endpoint
                val c=URL("$base/$action").openConnection() as HttpURLConnection
                try {
                    c.requestMethod="POST";c.connectTimeout=15000;c.readTimeout=180000;c.doOutput=true;c.instanceFollowRedirects=false
                    c.setRequestProperty("Content-Type","application/json")
                    c.setRequestProperty(if(review)"Authorization" else "OAI-Sites-Authorization","Bearer $token")
                    c.outputStream.use {it.write(payload.toByteArray(Charsets.UTF_8))}
                    val status=c.responseCode
                    if(status in listOf(301,302,303,307,308,401,403)){
                        reply(id,false,JSONObject().put("error","CLOUD_ACCESS").put("message","앱 접속 코드가 없거나 만료되었어요. ‘서버 연결 설정’을 확인해 주세요."))
                    }else{
                        val ok=status in 200..299
                        val stream=if(ok)c.inputStream else c.errorStream
                        val raw=stream?.bufferedReader()?.use{it.readText()}?:"{}"
                        val data=try{JSONObject(raw)}catch(_:Exception){JSONObject().put("error","CLOUD_RESPONSE").put("message","서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.")}
                        reply(id,ok&&!data.has("error"),data)
                    }
                } finally {c.disconnect()}
            }catch(_:Exception){reply(id,false,JSONObject().put("error","CONNECTION").put("message","클라우드 서버에 닿지 못했어요. 차량의 인터넷 연결을 확인한 뒤 다시 시도해 주세요."))}
        }
    }
    private fun reply(id:String,ok:Boolean,data:JSONObject) {
        if(closed)return
        val result=JSONObject().put("id",id).put("ok",ok).put("data",data)
        activity.runOnUiThread {if(!closed)activity.web.evaluateJavascript("window.onLiveResponse && window.onLiveResponse($result)",null)}
    }
    fun close(){dismissConfiguration();closed=true;workers.shutdownNow()}
}
