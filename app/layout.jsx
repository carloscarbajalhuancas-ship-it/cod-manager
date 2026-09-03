export const metadata = {
  title: 'COD Manager',
  description: 'Panel operativo y financiero COD',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-[#0d0f12] text-zinc-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
