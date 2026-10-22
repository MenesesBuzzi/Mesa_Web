// SUSSURROS · configuração de rede. É o único arquivo que você talvez queira editar.
export const CONFIG = {
  // Servidores ICE. STUN grátis do Google resolve a maioria das redes domésticas.
  // Se alguém não conseguir conectar (rede de empresa, 4G com NAT simétrico), adicione um TURN, ex.:
  // { urls: 'turn:SEU-SERVIDOR:3478', username: 'usuario', credential: 'senha' }
  // (a Metered.ca e a Cloudflare Calls têm TURN com cota grátis; precisa criar conta e pegar a credencial).
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  // null = servidor público grátis do PeerJS (0.peerjs.com). Para usar outro:
  // { host: 'meu-peerjs.exemplo.com', port: 443, path: '/', secure: true }
  servidorPeer: null,
  debugPeer: false,
};
