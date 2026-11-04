import styles from './studio-content.module.css';
/** Static shapes preserve the reviewed library layout without fabricated values. */
export default function PostsLoading() {
  return <div className={styles.page} aria-busy="true">
    <header className={styles.heading}><div className={styles.title}><h1>Content</h1><p role="status">Loading your video library…</p></div></header>
    <div className={styles.loadingFilters} aria-hidden="true">{[0,1,2,3].map(index=><i key={index}/>)}</div>
    <div className={styles.loadingSummary} aria-hidden="true" />
    <div className={styles.workspace} aria-hidden="true"><div className={styles.skeleton}>{[0,1,2,3,4,5].map(index=><div key={index}><i/><span><b/><b/><b/></span><em/></div>)}</div><div className={styles.loadingInspector}/></div>
  </div>;
}
