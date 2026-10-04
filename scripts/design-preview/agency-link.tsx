import { forwardRef, type ComponentProps } from 'react';
const FixtureLink = forwardRef<HTMLAnchorElement, ComponentProps<'a'>>((props, ref) => <a ref={ref} {...props} />);
FixtureLink.displayName = 'FixtureLink';
export default FixtureLink;
