import * as util from 'util';

interface UtilsInterface {
  initialized: boolean;
  textEncoder: TextEncoder;
  textDecoder: TextDecoder;
}

const holder: UtilsInterface = {
  initialized: false
} as UtilsInterface;

export function globalInit(options?: Partial<{
  textEncoder: TextEncoder;
  textDecoder: TextDecoder;
}>) {
  if (options?.textEncoder) {
    holder.textEncoder = options.textEncoder;
  } else {
    const TextEncoderRef = (typeof TextEncoder !== 'undefined') ? TextEncoder : util.TextEncoder;
    holder.textEncoder = new TextEncoderRef() as any;
  }
  if (options?.textDecoder) {
    holder.textDecoder = options.textDecoder;
  } else {
    const TextDecoderRef = (typeof TextDecoder !== 'undefined') ? TextDecoder : util.TextDecoder;
    holder.textDecoder = new TextDecoderRef() as any;
  }
  holder.initialized = true;
}

const instance: UtilsInterface = Object.create({});
Object.defineProperty(instance, 'textEncoder', {
  get() {
    if (!holder.initialized) {
      globalInit();
    }
    return holder.textEncoder;
  }
});
Object.defineProperty(instance, 'textDecoder', {
  get() {
    if (!holder.initialized) {
      globalInit();
    }
    return holder.textDecoder;
  }
});
export default instance;
