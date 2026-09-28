import { useParams } from 'react-router-dom'

/** Placeholder until Milestone 5. */
export default function Drills() {
  const { pieceId } = useParams()
  return (
    <section>
      <h1>Drills</h1>
      <p>Coming in Milestone 5.</p>
      {pieceId ? <p>Piece: {pieceId}</p> : null}
    </section>
  )
}
