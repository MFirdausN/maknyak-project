const domains = [
  ["Identity", "Principal, session, authentication"],
  ["Workspace", "Tenant, member, role, project"],
  ["AI", "Model, prompt, memory, tools"],
  ["Operations", "Audit, notification, storage"],
] as const;

export const dynamic = "force-dynamic";

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  return (
    <main>
      <nav>
        <span className="mark">M</span>
        <strong>Maknyak Platform</strong>
        <span className="status">
          <i /> Foundation v0.1
        </span>
      </nav>
      <section className="hero">
        <p className="eyebrow">BUILD THE COMPANY, NOT JUST THE APP</p>
        <h1>
          Satu fondasi.
          <br />
          <em>Banyak produk.</em>
        </h1>
        <p className="lead">
          Control plane untuk membangun software dan AI products yang aman,
          modular, dan siap berkembang bersama bisnis.
        </p>
        <div className="actions">
          <a href={`${apiUrl}/api/v1`}>
            Explore API <span>→</span>
          </a>
          <span>Identity · Workspace · AI</span>
        </div>
      </section>
      <section className="domains">
        {domains.map(([name, detail], index) => (
          <article key={name}>
            <small>0{index + 1}</small>
            <h2>{name}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </section>
      <footer>
        <span>MAKNYAK / PLATFORM</span>
        <span>Makassar, Indonesia</span>
      </footer>
    </main>
  );
}
