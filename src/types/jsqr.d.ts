declare module 'jsqr' {
  interface Point {
    x: number
    y: number
  }

  interface QRCode {
    binaryData: number[]
    data: string
    location: {
      topRightCorner: Point
      topLeftCorner: Point
      bottomRightCorner: Point
      bottomLeftCorner: Point
      topRightFinderPattern: Point
      topLeftFinderPattern: Point
      bottomLeftFinderPattern: Point
    }
  }

  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    providedOptions?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
  ): QRCode | null

  export = jsQR
}
