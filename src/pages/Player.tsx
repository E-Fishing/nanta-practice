import { useParams } from 'react-router-dom'

/** Placeholder until Milestone 2. */
export default function Player() {
  const { pieceId } = useParams()
  return (
    <section>
      <h1>Player</h1>
      <p>Coming in Milestone 2.</p>
      {pieceId ? <p>Piece: {pieceId}</p> : null}
    </section>
  )
}
