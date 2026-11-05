import Admin from "./Admin.jsx";
import Customer from "./Customer.jsx";

export default function App() {
  return window.location.pathname.startsWith("/admin") ? <Admin /> : <Customer />;
}
