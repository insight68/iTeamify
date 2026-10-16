import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.main}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.copy}>
        The page you are looking for doesn&rsquo;t exist or has been moved.
      </p>
      <Link href="/" className={styles.link}>
        Back to iteamify
      </Link>
    </main>
  );
}
