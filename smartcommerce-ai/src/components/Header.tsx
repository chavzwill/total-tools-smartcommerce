import logo from "../assets/brand/total-tools-logo-transparent.png";

export default function Header() {
  return (
    <>
      <div className="utility-bar">
        <div className="utility-links">
          <a href="#footer">Branches</a>
          <span>Islandwide delivery</span>
          <a href="#commercial">Commercial</a>
          <a href="#footer">Support</a>
        </div>
      </div>
      <header className="site-header">
        <a className="brand-logo" href="#top" aria-label="Total Tools Jamaica home">
          <img src={logo} alt="Total Tools Jamaica" />
        </a>
        <form className="global-search" role="search">
          <label className="sr-only" htmlFor="site-search">Search Total Tools</label>
          <input id="site-search" placeholder="Search products, rentals, repairs or ask AI..." />
          <button type="submit" aria-label="Search">Search</button>
        </form>
        <div className="header-actions" aria-label="Customer tools">
          <button aria-label="Account">Account</button>
          <button aria-label="Wishlist">Wishlist</button>
          <button aria-label="Cart">Cart <span>0</span></button>
        </div>
      </header>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#products">Products</a>
        <a href="#rentals">Rentals</a>
        <a href="#repairs">Repairs</a>
        <a href="#advisor">AI Assistant</a>
        <a href="#commercial">Commercial</a>
      </nav>
    </>
  );
}
