import WebChat from "./components/WebChat";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <main className={styles.main}>
        <section className={styles.chatPanel}>
          {/* 챗 화면 안에 표시되는 페이지 타이틀입니다. */}
          <header className={styles.titleBar}>
            <h1 className={styles.title}>파트너포탈 챗봇 v0.2</h1>
          </header>
          <WebChat />
        </section>
      </main>
    </div>
  );
}
