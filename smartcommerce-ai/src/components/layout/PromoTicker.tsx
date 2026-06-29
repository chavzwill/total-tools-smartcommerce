const promos = [
  "5% off your first online order",
  "Free islandwide delivery over J$50,000",
  "Weekend rental specials available",
  "Commercial account pricing available",
  "Ask AI to find the right tool faster",
];

export default function PromoTicker() {
  const tickerItems = [...promos, ...promos, ...promos];

  return (
    <aside className="sc-promo-ticker" aria-label="Current promotions">
      <div className="sc-promo-ticker__label" aria-hidden="true">Deals</div>
      <div className="sc-promo-ticker__viewport">
        <div className="sc-promo-ticker__track">
          {tickerItems.map((promo, index) => (
            <span className="sc-promo-ticker__item" key={`${promo}-${index}`}>
              {promo}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
