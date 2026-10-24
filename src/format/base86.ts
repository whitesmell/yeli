const ALPHABET =
  "!#$%()*+,./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz|}~";

export const BASE86_ALPHABET = ALPHABET;
export const BASE86_FORBIDDEN = [
  "</script",
  "<!--",
  "-->",
  "]]>",
  "${",
] as const;

const VALUE = new Int16Array(128).fill(-1);
for (let index = 0; index < ALPHABET.length; index += 1) {
  VALUE[ALPHABET.charCodeAt(index)] = index;
}

if (ALPHABET.length !== 86) {
  throw new Error(`Base86 alphabet must contain 86 symbols`);
}

export function encodeBase86(bytes: Uint8Array): string {
  const output: string[] = [];
  let offset = 0;
  for (; offset + 4 <= bytes.length; offset += 4) {
    let value =
      ((bytes[offset]! << 24) >>> 0) +
      (bytes[offset + 1]! << 16) +
      (bytes[offset + 2]! << 8) +
      bytes[offset + 3]!;
    const group = new Array<string>(5);
    for (let index = 4; index >= 0; index -= 1) {
      group[index] = ALPHABET[value % 86]!;
      value = Math.floor(value / 86);
    }
    output.push(group.join(""));
  }

  const remainder = bytes.length - offset;
  if (remainder > 0) {
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      value = value * 256 + (index < remainder ? bytes[offset + index]! : 0);
    }
    const group = new Array<string>(5);
    for (let index = 4; index >= 0; index -= 1) {
      group[index] = ALPHABET[value % 86]!;
      value = Math.floor(value / 86);
    }
    output.push(group.slice(0, remainder + 1).join(""));
  }
  return output.join("");
}

export function decodeBase86(text: string): Uint8Array {
  if (text.length % 5 === 1) {
    throw new Error("Base86 trailing single character cannot encode a byte");
  }
  const fullGroups = Math.floor(text.length / 5);
  const remainder = text.length - fullGroups * 5;
  const output = new Uint8Array(
    fullGroups * 4 + (remainder > 0 ? remainder - 1 : 0),
  );
  let outputOffset = 0;
  let inputOffset = 0;

  const valueAt = (index: number): number => {
    const code = text.charCodeAt(index);
    const value = code < VALUE.length ? VALUE[code]! : -1;
    if (value < 0) {
      throw new Error(
        `Base86 invalid character code ${code} at index ${index}`,
      );
    }
    return value;
  };

  for (; inputOffset + 5 <= text.length; inputOffset += 5) {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      value = value * 86 + valueAt(inputOffset + index);
    }
    if (value > 0xffff_ffff) {
      throw new Error("Base86 group exceeds four bytes");
    }
    output[outputOffset++] = (value / 0x100_0000) & 0xff;
    output[outputOffset++] = (value >>> 16) & 0xff;
    output[outputOffset++] = (value >>> 8) & 0xff;
    output[outputOffset++] = value & 0xff;
  }

  if (remainder > 0) {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      value =
        value * 86 + (index < remainder ? valueAt(inputOffset + index) : 85);
    }
    const group = [
      (value / 0x100_0000) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
    for (let index = 0; index < remainder - 1; index += 1) {
      output[outputOffset++] = group[index]!;
    }
  }

  return output;
}

export const BASE86_LOADER_DECODER = `
var B86=${JSON.stringify(ALPHABET)};
var b86v=new Int16Array(128);for(var q=0;q<128;q++)b86v[q]=-1;
for(var q=0;q<86;q++)b86v[B86.charCodeAt(q)]=q;
function b86decode(t){
  var n=t.length,full=(n/5)|0,rest=n-full*5;
  if(rest===1)throw new Error("base86: invalid trailing character");
  var out=new Uint8Array(full*4+(rest?rest-1:0)),o=0,i=0,v;
  function c(j){
    var x=t.charCodeAt(j),y=x<128?b86v[x]:-1;
    if(y<0)throw new Error("base86: invalid character code "+x+" at index "+j);
    return y;
  }
  for(;i+5<=n;i+=5){
    v=(((c(i)*86+c(i+1))*86+c(i+2))*86+c(i+3))*86+c(i+4);
    if(v>4294967295)throw new Error("base86: group exceeds four bytes");
    out[o++]=(v/16777216)&255;out[o++]=(v>>>16)&255;out[o++]=(v>>>8)&255;out[o++]=v&255;
  }
  if(rest){
    v=0;
    for(var k=0;k<5;k++)v=v*86+(k<rest?c(i+k):85);
    var tail=[(v/16777216)&255,(v>>>16)&255,(v>>>8)&255,v&255];
    for(var k2=0;k2<rest-1;k2++)out[o++]=tail[k2];
  }
  return out;
}
`.trim();
