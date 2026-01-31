import { Slot, component$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";

export default component$(() => {
  const loc = useLocation();

  const links = [
    { href: "/", label: "Home" },
    { href: "/a/", label: "Page A" },
    { href: "/b/", label: "Page B" },
    { href: "/c/", label: "Page C" },
    { href: "/d/", label: "Page D" },
  ];

  return (
    <>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          display: "flex",
          gap: "0",
          background: "#1a1a2e",
          borderBottom: "2px solid #e94560",
          fontFamily: "monospace",
          fontSize: "14px",
        }}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              padding: "12px 20px",
              color: loc.url.pathname === link.href ? "#e94560" : "#eee",
              textDecoration: "none",
              fontWeight: loc.url.pathname === link.href ? "bold" : "normal",
              background:
                loc.url.pathname === link.href
                  ? "rgba(233, 69, 96, 0.1)"
                  : "transparent",
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Slot />
    </>
  );
});
