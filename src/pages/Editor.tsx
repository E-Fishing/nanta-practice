import { useParams } from 'react-router-dom'

/** Placeholder until Milestone 7. */
export default function Editor() {
  const { pieceId } = useParams()
  return (
    <section>
      <h1>Editor</h1>
      <p>Coming in Milestone 7.</p>
      {pieceId ? <p>Piece: {pieceId}</p> : null}
    </section>
  )
}
