// Bandeau diagonal « En test » dans le coin d'une carte du Hub.
//
// Le parent doit être `position: relative` ET rogner ses coins : le ruban dépasse
// volontairement de la carte, c'est l'`overflow: hidden` du conteneur ci-dessous
// qui lui donne ses deux bords coupés.
//
// `aria-hidden` + `pointerEvents: none` : purement décoratif, et la carte entière
// est un lien — le ruban ne doit pas avaler le clic.
export default function BandeauTest({ couleur = '#FF8B3D' }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 88,
        height: 88,
        overflow: 'hidden',
        pointerEvents: 'none',
        borderTopRightRadius: 16, // aligné sur le rounded-2xl de la carte
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 13,
          right: -30,
          width: 124,
          transform: 'rotate(45deg)',
          background: couleur,
          color: '#0a0f1a',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1,
          textAlign: 'center',
          textTransform: 'uppercase',
          padding: '3px 0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }}
      >
        En test
      </div>
    </div>
  )
}
