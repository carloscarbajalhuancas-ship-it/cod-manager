export const metadata = {
  title: 'COD Manager',
  description: 'Panel operativo y financiero COD',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
