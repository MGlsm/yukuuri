const input = document.getElementById("input")
const generate = document.getElementById("generate")
const playToggle = document.getElementById("play")
const download = document.getElementById("download")
const downloadMp3 = document.getElementById("download-mp3")
const copy = document.getElementById("copy")
const synthText = document.getElementById("synth-text")
const speed = document.getElementById("speed")
const rate = document.getElementById("speednumber")
const errorBox = document.getElementById("error")
const warningBox = document.getElementById("warning")
const autoRemoveSpaces = document.getElementById("auto-remove-spaces")
const newlineToPeriod = document.getElementById("newline-to-period")
const punctuationToJapanese = document.getElementById("punctuation-to-japanese")
const numberToChinese = document.getElementById("number-to-chinese")

let msg = Qmsg.loading("加载中")
let currentWav = null
let currentMp3Blob = null
let currentPlaybackKind = ""
let currentAudio = null
let currentAudioUrl = ""
let currentAudioBuffer = null
let audioContext = null
let webAudioSource = null
let webAudioStartedAt = 0
let webAudioOffset = 0
let webAudioPlaying = false
let aquestalk = null
let convert = null

generate.disabled = true

speed.oninput = () => {
  rate.textContent = speed.value
}

function getNormalizeOptions() {
  return {
    removeSpaces: autoRemoveSpaces.checked,
    convertNewlines: newlineToPeriod.checked,
    punctuationToJapanese: punctuationToJapanese.checked,
  }
}

function normalizeForYukuuri(text, options = {}) {
  text = String(text)
  const {
    removeSpaces = true,
    convertNewlines = true,
    punctuationToJapanese = true,
  } = options

  if (convertNewlines) {
    text = text.replace(/(?:\r\n|\r|\n|\u2028|\u2029)+/g, "。")
  }
  if (punctuationToJapanese) {
    text = text
      .replace(/，/g, "、")
      .replace(/,/g, "、")
      .replace(/！/g, "。")
      .replace(/!/g, "。")
  }
  if (removeSpaces) {
    text = text.replace(/[ \t　]+/g, "")
  }
  return text
}

function setError(message) {
  errorBox.textContent = message
  errorBox.hidden = !message
}

function setWarning(message) {
  warningBox.textContent = message
  warningBox.hidden = !message
}

function resetAudio() {
  currentWav = null
  currentMp3Blob = null
  currentPlaybackKind = ""
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  stopWebAudioPlayback()
  currentAudioBuffer = null
  webAudioOffset = 0
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
    currentAudioUrl = ""
  }
  playToggle.disabled = true
  download.disabled = true
  downloadMp3.disabled = true
  playToggle.textContent = "播放"
}

function setAudio(wav) {
  resetAudio()
  currentWav = wav
  prepareHtmlAudio(new Blob([wav], { type: "audio/wav" }), "wav")
  playToggle.disabled = false
  download.disabled = false
  downloadMp3.disabled = false
}

function isMobileLike() {
  return window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function prepareHtmlAudio(blob, kind) {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
  }

  currentPlaybackKind = kind
  currentAudioUrl = URL.createObjectURL(blob)
  currentAudio = new Audio()
  currentAudio.preload = "auto"
  currentAudio.src = currentAudioUrl
  currentAudio.onended = () => {
    playToggle.textContent = "播放"
  }
}

function ensurePreferredAudioSource() {
  if (!currentWav) return

  if (isMobileLike()) {
    if (!currentMp3Blob) {
      currentMp3Blob = wavToMp3(currentWav)
    }
    if (currentPlaybackKind !== "mp3") {
      prepareHtmlAudio(currentMp3Blob, "mp3")
    }
  } else if (currentPlaybackKind !== "wav") {
    prepareHtmlAudio(new Blob([currentWav], { type: "audio/wav" }), "wav")
  }
}

function stopWebAudioPlayback() {
  if (webAudioSource) {
    webAudioSource.onended = null
    try {
      webAudioSource.stop()
    } catch(error) {
      // Source may already be stopped.
    }
    webAudioSource = null
  }
  webAudioPlaying = false
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    throw new Error("当前浏览器不支持 Web Audio 播放")
  }
  if (!audioContext) {
    audioContext = new AudioContextClass()
  }
  return audioContext
}

async function getCurrentAudioBuffer() {
  if (currentAudioBuffer) {
    return currentAudioBuffer
  }
  if (!currentWav) {
    throw new Error("还没有生成音频")
  }

  const context = getAudioContext()
  const wavCopy = currentWav.buffer.slice(
    currentWav.byteOffset,
    currentWav.byteOffset + currentWav.byteLength,
  )
  currentAudioBuffer = await context.decodeAudioData(wavCopy)
  return currentAudioBuffer
}

async function playWithWebAudio() {
  const context = getAudioContext()
  if (context.state === "suspended") {
    await context.resume()
  }

  const buffer = await getCurrentAudioBuffer()
  stopWebAudioPlayback()

  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.onended = () => {
    if (webAudioPlaying) {
      webAudioOffset = 0
      webAudioPlaying = false
      playToggle.textContent = "播放"
    }
    webAudioSource = null
  }

  webAudioStartedAt = context.currentTime - webAudioOffset
  source.start(0, webAudioOffset)
  webAudioSource = source
  webAudioPlaying = true
  playToggle.textContent = "暂停"
}

function pauseWebAudio() {
  if (!webAudioPlaying) return
  const context = getAudioContext()
  webAudioOffset = Math.max(0, context.currentTime - webAudioStartedAt)
  stopWebAudioPlayback()
  playToggle.textContent = "播放"
}

function makeDownloadName(extension) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)
  const prefix = input.value.trim().slice(0, 10).replace(/[\\/:*?"<>|\s]/g, "")
  return `yukuuri_${timestamp}_${prefix || "audio"}.${extension}`
}

function isAbortError(error) {
  return error && (
    error.name === "AbortError" ||
    error.name === "NotAllowedError" ||
    String(error.message || "").toLowerCase().includes("abort") ||
    String(error.message || "").includes("取消")
  )
}

async function saveBlob(blob, filename, title) {
  if (window.File && navigator.canShare && navigator.share) {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" })
    if (navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title,
        text: title,
      }).catch(error => {
        if (!isAbortError(error)) {
          setWarning(`系统分享不可用，请用浏览器打开页面后重试：${error.message || error}`)
        }
      })
      setWarning("已尝试打开系统分享面板；如果没有弹出，请用 Safari 或系统浏览器打开页面。")
      return
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.download = filename
  a.href = url
  a.rel = "noopener"
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function downloadBlob(blob, filename, title) {
  saveBlob(blob, filename, title).catch(error => {
    setError(`保存失败：${error.message || error}`)
  })
}

function parseWavPcm16(wav) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const readString = (offset, length) => {
    let value = ""
    for (let i = 0; i < length; i++) {
      value += String.fromCharCode(view.getUint8(offset + i))
    }
    return value
  }

  if (readString(0, 4) !== "RIFF" || readString(8, 4) !== "WAVE") {
    throw new Error("不是有效的 WAV 数据")
  }

  let offset = 12
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = 0
  let dataSize = 0

  while (offset + 8 <= view.byteLength) {
    const chunkId = readString(offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8

    if (chunkId === "fmt ") {
      const audioFormat = view.getUint16(chunkDataOffset, true)
      channels = view.getUint16(chunkDataOffset + 2, true)
      sampleRate = view.getUint32(chunkDataOffset + 4, true)
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true)
      if (audioFormat !== 1 || bitsPerSample !== 16) {
        throw new Error("当前只支持 16-bit PCM WAV 转 MP3")
      }
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset
      dataSize = chunkSize
      break
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2)
  }

  if (!dataOffset || !dataSize || !channels || !sampleRate) {
    throw new Error("WAV 数据缺少必要音频信息")
  }

  const samples = new Int16Array(wav.buffer, wav.byteOffset + dataOffset, dataSize / 2)
  return { channels, sampleRate, samples }
}

function resampleChannel(channel, sourceRate, targetRate) {
  if (sourceRate === targetRate) return channel

  const ratio = sourceRate / targetRate
  const outputLength = Math.max(1, Math.round(channel.length / ratio))
  const output = new Int16Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio
    const leftIndex = Math.floor(sourceIndex)
    const rightIndex = Math.min(leftIndex + 1, channel.length - 1)
    const amount = sourceIndex - leftIndex
    output[i] = Math.round(channel[leftIndex] * (1 - amount) + channel[rightIndex] * amount)
  }

  return output
}

function splitChannels(samples, channels) {
  if (channels === 1) {
    return [samples]
  }

  const left = new Int16Array(samples.length / 2)
  const right = new Int16Array(samples.length / 2)
  for (let i = 0, j = 0; i < samples.length; i += 2, j++) {
    left[j] = samples[i]
    right[j] = samples[i + 1]
  }
  return [left, right]
}

function wavToMp3(wav) {
  if (!window.lamejs) {
    throw new Error("MP3 编码器未加载")
  }

  const { channels, sampleRate, samples } = parseWavPcm16(wav)
  const targetSampleRate = sampleRate < 32000 ? 44100 : sampleRate
  const pcmChannels = splitChannels(samples, channels).map(channel => (
    resampleChannel(channel, sampleRate, targetSampleRate)
  ))
  const encoder = new lamejs.Mp3Encoder(channels, targetSampleRate, 128)
  const mp3Data = []
  const blockSize = 1152

  if (channels === 1) {
    const [mono] = pcmChannels
    for (let i = 0; i < mono.length; i += blockSize) {
      const chunk = mono.subarray(i, i + blockSize)
      const buffer = encoder.encodeBuffer(chunk)
      if (buffer.length) mp3Data.push(buffer)
    }
  } else if (channels === 2) {
    const [left, right] = pcmChannels
    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = left.subarray(i, i + blockSize)
      const rightChunk = right.subarray(i, i + blockSize)
      const buffer = encoder.encodeBuffer(leftChunk, rightChunk)
      if (buffer.length) mp3Data.push(buffer)
    }
  } else {
    throw new Error("当前只支持单声道或双声道 WAV 转 MP3")
  }

  const end = encoder.flush()
  if (end.length) mp3Data.push(end)
  return new Blob(mp3Data, { type: "audio/mpeg" })
}

async function generateSpeech() {
  setError("")
  setWarning("")
  resetAudio()

  const source = input.value.trim()
  if (!source) {
    setError("请输入中文文本")
    return
  }
  if (/[A-Za-z]/.test(source)) {
    setWarning("当前合成器不支持英文，建议改成中文、拼音或假名。")
  }

  try {
    if (!aquestalk || !convert) {
      setError("合成器还在加载，请稍后再试")
      return
    }
    generate.disabled = true
    generate.textContent = "生成中..."
    const sourceForConvert = newlineToPeriod.checked
      ? source.replace(/(?:\r\n|\r|\n|\u2028|\u2029)+/g, "。")
      : source
    const kana = convert(sourceForConvert, { convertNumbers: numberToChinese.checked })
    const normalized = normalizeForYukuuri(kana, getNormalizeOptions())
    synthText.value = normalized
    const wav = await aquestalk.run(normalized, parseInt(speed.value))
    setAudio(wav)
  } catch(error) {
    setError(`合成失败：${error.message || error}`)
  } finally {
    generate.disabled = false
    generate.textContent = "一键生成语音"
  }
}

generate.onclick = generateSpeech

playToggle.onclick = async () => {
  if (!currentWav) return

  if (webAudioPlaying) {
    pauseWebAudio()
    return
  }

  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause()
    playToggle.textContent = "播放"
    return
  }

  try {
    ensurePreferredAudioSource()
    if (!currentAudio) {
      throw new Error("播放源未准备好")
    }
    await currentAudio.play()
    playToggle.textContent = "暂停"
  } catch(error) {
    try {
      await playWithWebAudio()
    } catch(fallbackError) {
      setError(`播放失败：${fallbackError.message || fallbackError}`)
    }
  }
}

download.onclick = async () => {
  if (!currentWav) return
  const blob = new Blob([currentWav], { type: "audio/wav" })
  download.disabled = true
  download.textContent = "准备中..."
  try {
    await saveBlob(blob, makeDownloadName("wav"), "Yukuuri WAV 音频")
  } catch(error) {
    setError(`WAV 保存失败：${error.message || error}`)
  } finally {
    download.disabled = false
    download.textContent = "保存/分享 WAV"
  }
}

downloadMp3.onclick = async () => {
  if (!currentWav) return
  try {
    downloadMp3.disabled = true
    downloadMp3.textContent = "转换中..."
    const blob = currentMp3Blob || wavToMp3(currentWav)
    currentMp3Blob = blob
    downloadMp3.textContent = "保存中..."
    await saveBlob(blob, makeDownloadName("mp3"), "Yukuuri MP3 音频")
  } catch(error) {
    setError(`MP3 导出失败：${error.message || error}`)
  } finally {
    downloadMp3.disabled = false
    downloadMp3.textContent = "保存/分享 MP3"
  }
}

copy.onclick = async () => {
  try {
    await navigator.clipboard.writeText(synthText.value)
    Qmsg.success("已复制合成文本")
  } catch(error) {
    synthText.select()
    document.execCommand("copy")
    Qmsg.success("已复制合成文本")
  }
}

async function initApp() {
  try {
    aquestalk = await loadAquesTalk("./static/f1.zip", "f1/AquesTalk.dll")
    convert = await initConverter()
    generate.disabled = false
    msg.close()
    Qmsg.success("加载成功")
  } catch(error) {
    msg.close()
    setError(`加载失败：${error.message || error}`)
  }
}

initApp()
