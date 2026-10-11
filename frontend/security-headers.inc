# Cabeçalhos de segurança repetidos em cada location (o nginx não herda add_header
# de um bloco para o outro quando o filho define algum).
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
# SPA servida só do próprio domínio. 'unsafe-inline' em style por causa dos estilos inline do React;
# img data:/blob: para o QR Code e as imagens de anexos; object blob: para abrir PDFs baixados com token.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
