var chineseNumber = window.index.NumberToChineseWords

async function initConverter() {
    var converter = window.YUKUURI_CONVERTER_TSV
        ? new PinyinToKana(window.YUKUURI_CONVERTER_TSV)
        : await PinyinToKana.loadDict("static/converter.tsv")
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
