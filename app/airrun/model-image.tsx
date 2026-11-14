import NextImage from 'next/image';
// Vinext and Node's SSR loader expose the CJS image module with different wrapping.
const ModelImage = (NextImage as unknown as { default?: typeof NextImage }).default ?? NextImage;
export default ModelImage;
