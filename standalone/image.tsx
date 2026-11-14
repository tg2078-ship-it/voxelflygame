import type { ImgHTMLAttributes } from 'react';
import { assetUrl } from '../app/airrun/asset-url';

type Props = ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean };
/** Game previews already use native rendered images; no image server is needed. */
export default function StaticImage(props: Props) {
    const native = { ...props };
    delete native.unoptimized;
    if (typeof native.src === 'string') native.src = assetUrl(native.src);
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...native} alt={props.alt ?? ''}/>;
}
