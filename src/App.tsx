import { Routes, Route } from "react-router";
import Home from "./pages/Home";
import Rooms from "./pages/Rooms";
import Availability from "./pages/Availability";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminReservations from "./pages/AdminReservations";
import AdminReservationDetail from "./pages/AdminReservationDetail";
import AdminRooms from "./pages/AdminRooms";
import AdminRates from "./pages/AdminRates";
import AdminAvailability from "./pages/AdminAvailability";
import AdminMedia from "./pages/AdminMedia";
import AdminSettings from "./pages/AdminSettings";
import AdminWalkIn from "./pages/AdminWalkIn";
import NotFound from "./pages/NotFound";
import { Analytics } from "./components/Analytics";

export default function App() {
  return <><Analytics /><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/rooms" element={<Rooms />} />
    <Route path="/availability" element={<Availability />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/faq" element={<FAQ />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/reservations" element={<AdminReservations />} />
    <Route path="/admin/reservations/:id" element={<AdminReservationDetail />} />
    <Route path="/admin/rooms" element={<AdminRooms />} />
    <Route path="/admin/rates" element={<AdminRates />} />
    <Route path="/admin/availability" element={<AdminAvailability />} />
    <Route path="/admin/media" element={<AdminMedia />} />
    <Route path="/admin/settings" element={<AdminSettings />} />
    <Route path="/admin/walk-in" element={<AdminWalkIn />} />
    <Route path="*" element={<NotFound />} />
  </Routes></>;
}
