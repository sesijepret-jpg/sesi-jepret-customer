declare module 'gifenc' {
  export interface QuantizeOptions {
    format?: 'rgb565' | 'rgb444' | 'rgba4444';
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export type RGBColor = [number, number, number];
  export type RGBAColor = [number, number, number, number];
  export type Palette = RGBColor[] | RGBAColor[];

  export interface WriteFrameOptions {
    palette?: Palette;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
  }

  export interface GIFEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame: (index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
    writeHeader: () => void;
    reset: () => void;
    buffer: ArrayBuffer;
    stream: {
      writeByte: (byte: number) => void;
      writeBytes: (bytes: ArrayLike<number>, offset?: number, byteLength?: number) => void;
    };
  }

  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
  ): Uint8Array;

  export function nearestColorIndex(palette: Palette, pixel: RGBColor | RGBAColor): number;

  export function nearestColorIndexWithDistance(
    palette: Palette,
    pixel: RGBColor | RGBAColor
  ): [number, number];
}
