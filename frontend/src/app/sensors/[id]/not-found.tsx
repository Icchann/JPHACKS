import Link from "next/link";

export default function SensorNotFound() {
  return (
    <main className="placeholder-page">
      <section className="placeholder-card">
        <p className="placeholder-eyebrow">SENSOR NOT FOUND</p>
        <h1>センサーが見つかりません</h1>
        <p>指定されたセンサーはデモデータに登録されていません。</p>
        <Link href="/map">地図へ戻る</Link>
      </section>
    </main>
  );
}
