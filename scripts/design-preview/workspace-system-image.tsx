import type { ComponentProps } from 'react';
type Props = ComponentProps<'img'> & { fill?: boolean; priority?: boolean; unoptimized?: boolean };
export default function FixtureImage({ fill, priority, unoptimized, alt, ...props }: Props) {
  void [fill, priority, unoptimized];
  // This fixture has no Next image service; production continues using next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt ?? ''} />;
}
