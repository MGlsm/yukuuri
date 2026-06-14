class PinyinToKana {
  constructor( mapping ) {
    this.#loadMap( mapping )
  }
  pinyinToKana( pinyin ) {
    return this.pinyin_to_kana(pinyin.replaceAll( "，", "、" ).replace( /([^a-zA-Z ]+)/g, " $1 " ))
  }
  pinyin_to_kana( pinyin ) {
    return pinyin.trim().toLowerCase().split( " " ).map(t => this.map.get(t) || t ).join( "" )
  }
  #loadMap( tsv ) {
    tsv = tsv.split( "\n" ).map(t => t.split( "\t" ))
    this.map = new Map( tsv )
  }
  static async loadDict( path ) {
    return new PinyinToKana(await (await fetch( path )).text())
  }
}

if( typeof module === "object" )
  module.exports = PinyinToKana

// console.log( new PinyinToKana( require( "fs" ).readFileSync("mapping.tsv").toString() ).pinyinToKana( "Ni hao，shi jie" ))
// ニーハオ、シージエ