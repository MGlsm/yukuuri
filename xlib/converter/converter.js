var chineseNumber = window.index.NumberToChineseWords

async function initConverter() {
    var PinyinToKanaClass = window.PinyinToKana
    if (!PinyinToKanaClass) {
        throw new Error("拼音转假名模块加载失败")
    }
    var converter = window.YUKUURI_CONVERTER_TSV
        ? new PinyinToKanaClass(window.YUKUURI_CONVERTER_TSV)
        : await PinyinToKanaClass.loadDict("static/converter.tsv")
    return (string, options = {}) => {
        const { convertNumbers = true } = options
        if (convertNumbers) {
            string = string.replace(/-{0,1}\d+(\.\d+){0,1}/g, matched => {
                try {
                    return chineseNumber.toWords(Number(matched))
                } catch(error) {
                    return matched
                }
            })
        }
        string = string.replaceAll(" ", "_")
        var kana = converter.pinyinToKana(
            Pinyin.parse( string ).map( t => t.type === 2 ? t.target + " " : t.source ).join( "" )
        ).replaceAll("_", " ").replace(/(?:\r\n|\r|\n)+/g, " ")
        return wanakana.toKatakana(kana)
    }
}
