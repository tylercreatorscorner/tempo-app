import { LoadingStatus } from '@/components/ui/loading-status';
import styles from '@/components/dashboard/morning-review.module.css';
export default function Loading() {
 return <div className={styles.page}><LoadingStatus label="Loading manager reviews" detail="Preparing goals and recorded monthly performance"/></div>;
}
