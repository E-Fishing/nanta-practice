import { useParams } from 'react-router-dom'

/** Placeholder until Milestone 6. */
export default function Progress() {
  const { pieceId } = useParams()
  return (
    <section>
      <h1>Progress</h1>
      <p>Coming in Milestone 6.</p>
      {pieceId ? <p>Piece: {pieceId}</p> : null}
    </section>
  )
}
