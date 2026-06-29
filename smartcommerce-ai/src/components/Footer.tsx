import logo from "../assets/brand/total-tools-logo-transparent.png";

export default function Footer() {
  return (
    <footer className="site-footer" id="footer">
      <div className="footer-lead">
        <a className="logo footer-logo" href="#top" aria-label="Total Tools home">
          <img src={logo} alt="Total Tools" loading="lazy" decoding="async" />
        </a>
        <h2>Tools, expertise, and intelligence in one place.</h2>
      </div>
      <div className="footer-columns">
        <div><strong>Shop</strong><a href="#products">Products</a><a href="#products">Deals</a><a href="#commercial">Categories</a></div>
        <div><strong>Services</strong><a href="#rentals">Rentals</a><a href="#repairs">Repairs</a><a href="#advisor">AI Advisor</a></div>
        <div><strong>Business</strong><a href="#commercial-accounts">Commercial accounts</a><a href="#commercial-accounts">Fleet rentals</a><a href="#commercial-accounts">Bulk purchasing</a></div>
        <div><strong>Contact</strong><span>Trade desk: 1300 000 888</span><span>Open 6:30am to 6:00pm</span><span>Islandwide delivery</span></div>
      </div>
      <div className="footer-bottom"><span>SmartCommerce executive demo</span><a href="#top">Back to top</a></div>
    </footer>
  );
}
