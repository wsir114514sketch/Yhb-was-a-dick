/** The home-page cover of the Monopoly entry: the game's key art, cropped to fill the card. */
import "./monopoly-cover.css";

export function MonopolyCover() {
  return (
    <div className="mp-cover" aria-hidden="true">
      <img src="/assets/monopoly/cover.jpg" alt="" draggable={false} />
    </div>
  );
}
