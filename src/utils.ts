import * as util from 'util';

const TextEncoderRef = (typeof TextEncoder !== 'undefined') ? TextEncoder : util.TextEncoder;
const TextDecoderRef = (typeof TextDecoder !== 'undefined') ? TextDecoder : util.TextDecoder;

export const textEncoder = new TextEncoderRef();
export const textDecoder = new TextDecoderRef();
