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
let currentAudio = null
let currentAudioUrl = ""
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
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
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
  const blob = new Blob([wav], { type: "audio/wav" })
  currentAudioUrl = URL.createObjectURL(blob)
  currentAudio = new Audio(currentAudioUrl)
  currentAudio.onended = () => {
    playToggle.textContent = "播放"
  }
  playToggle.disabled = false
  download.disabled = false
  downloadMp3.disabled = false
}

function makeDownloadName(extension) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)
  const prefix = input.value.trim().slice(0, 10).replace(/[\\/:*?"<>|\s]/g, "")
  return `yukuuri_${timestamp}_${prefix || "audio"}.${extension}`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.download = filename
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
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

function wavToMp3(wav) {
  if (!window.lamejs) {
    throw new Error("MP3 编码器未加载")
  }

  const { channels, sampleRate, samples } = parseWavPcm16(wav)
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128)
  const mp3Data = []
  const blockSize = 1152

  if (channels === 1) {
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize)
      const buffer = encoder.encodeBuffer(chunk)
      if (buffer.length) mp3Data.push(buffer)
    }
  } else if (channels === 2) {
    const left = new Int16Array(samples.length / 2)
    const right = new Int16Array(samples.length / 2)
    for (let i = 0, j = 0; i < samples.length; i += 2, j++) {
      left[j] = samples[i]
      right[j] = samples[i + 1]
    }
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
  if (!currentAudio) return
  if (currentAudio.paused) {
    try {
      await currentAudio.play()
      playToggle.textContent = "暂停"
    } catch(error) {
      setError(`播放失败：${error.message || error}`)
    }
  } else {
    currentAudio.pause()
    playToggle.textContent = "播放"
  }
}

download.onclick = () => {
  if (!currentWav) return
  const blob = new Blob([currentWav], { type: "audio/wav" })
  downloadBlob(blob, makeDownloadName("wav"))
}

downloadMp3.onclick = () => {
  if (!currentWav) return
  try {
    downloadMp3.disabled = true
    downloadMp3.textContent = "转换中..."
    const blob = wavToMp3(currentWav)
    downloadBlob(blob, makeDownloadName("mp3"))
  } catch(error) {
    setError(`MP3 导出失败：${error.message || error}`)
  } finally {
    downloadMp3.disabled = false
    downloadMp3.textContent = "下载 MP3"
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
