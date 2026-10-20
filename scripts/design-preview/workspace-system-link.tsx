import { forwardRef, type ComponentProps } from 'react';
import { navigate } from './workspace-system-navigation';
type Props = ComponentProps<'a'> & { prefetch?: boolean; replace?: boolean; scroll?: boolean };
const FixtureLink = forwardRef<HTMLAnchorElement, Props>(({ onClick, prefetch, replace, scroll, ...props }, ref) => { void [prefetch, replace, scroll]; return <a ref={ref} {...props} onClick={event => { onClick?.(event); if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && props.target !== '_blank' && props.href?.startsWith('/')) { event.preventDefault(); navigate(props.href); } }} />; });
FixtureLink.displayName = 'FixtureLink';
export function useLinkStatus() { return { pending: false }; }
export default FixtureLink;
