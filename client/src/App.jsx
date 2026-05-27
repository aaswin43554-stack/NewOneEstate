import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';

// Existing pages
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import LotDetail from './pages/LotDetail';

// Roast session pages
import RoastList   from './pages/roast/RoastList';
import RoastNew    from './pages/roast/RoastNew';
import RoastLive   from './pages/roast/RoastLive';
import RoastDetail from './pages/roast/RoastDetail';

// Allocation pages
import AllocationDashboard  from './pages/allocations/AllocationDashboard';
import AllocationNew        from './pages/allocations/AllocationNew';
import AllocationDetail     from './pages/allocations/AllocationDetail';
import AllocationAddRequest from './pages/allocations/AllocationAddRequest';

// Profile pages
import ProfileList   from './pages/profiles/ProfileList';
import ProfileNew    from './pages/profiles/ProfileNew';
import ProfileDetail from './pages/profiles/ProfileDetail';
import ProfileEdit   from './pages/profiles/ProfileEdit';

// Cupping pages
import CuppingList    from './pages/cupping/CuppingList';
import CuppingNew     from './pages/cupping/CuppingNew';
import CuppingDetail  from './pages/cupping/CuppingDetail';
import CuppingCompare from './pages/cupping/CuppingCompare';

// Label pages
import LabelsIndex  from './pages/labels/LabelsIndex';
import LabelPreview from './pages/labels/LabelPreview';

// Public pages (no auth)
import PublicAllocation from './pages/public/PublicAllocation';

// Journal pages
import JournalDashboard from './pages/journal/JournalDashboard';
import JournalEntry     from './pages/journal/JournalEntry';

// Contact pages
import ContactList        from './pages/contacts/ContactList';
import ContactForm        from './pages/contacts/ContactForm';
import ContactDetail      from './pages/contacts/ContactDetail';
import ContactPrivateList from './pages/contacts/ContactPrivateList';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function P({ element }) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/public/allocations/:id" element={<PublicAllocation />} />

          {/* Dashboard */}
          <Route path="/"          element={<P element={<Dashboard />} />} />
          <Route path="/dashboard" element={<P element={<Dashboard />} />} />

          {/* Inventory (existing) */}
          <Route path="/inventory"    element={<P element={<Inventory />} />} />
          <Route path="/inventory/:id" element={<P element={<LotDetail />} />} />

          {/* Roast sessions */}
          <Route path="/roast"             element={<P element={<RoastList />} />} />
          <Route path="/roast/new"         element={<P element={<RoastNew />} />} />
          <Route path="/roast/:id/live"    element={<P element={<RoastLive />} />} />
          <Route path="/roast/:id"         element={<P element={<RoastDetail />} />} />

          {/* Allocations */}
          <Route path="/allocations"                    element={<P element={<AllocationDashboard />} />} />
          <Route path="/allocations/new"               element={<P element={<AllocationNew />} />} />
          <Route path="/allocations/:id"               element={<P element={<AllocationDetail />} />} />
          <Route path="/allocations/:id/add-request"   element={<P element={<AllocationAddRequest />} />} />

          {/* Profiles */}
          <Route path="/profiles"        element={<P element={<ProfileList />} />} />
          <Route path="/profiles/new"    element={<P element={<ProfileNew />} />} />
          <Route path="/profiles/:id"    element={<P element={<ProfileDetail />} />} />
          <Route path="/profiles/:id/edit" element={<P element={<ProfileEdit />} />} />

          {/* Cupping */}
          <Route path="/cupping"         element={<P element={<CuppingList />} />} />
          <Route path="/cupping/new"     element={<P element={<CuppingNew />} />} />
          <Route path="/cupping/compare" element={<P element={<CuppingCompare />} />} />
          <Route path="/cupping/:id"     element={<P element={<CuppingDetail />} />} />

          {/* Labels */}
          <Route path="/labels" element={<P element={<LabelsIndex />} />} />
          <Route path="/labels/:allocation_id" element={<P element={<LabelPreview />} />} />

          {/* Journal */}
          <Route path="/journal"                          element={<P element={<JournalDashboard />} />} />
          <Route path="/journal/:allocation_id/:type"     element={<P element={<JournalEntry />} />} />

          {/* Contacts */}
          <Route path="/contacts"                   element={<P element={<ContactList />} />} />
          <Route path="/contacts/new"               element={<P element={<ContactForm />} />} />
          <Route path="/contacts/private-list"      element={<P element={<ContactPrivateList />} />} />
          <Route path="/contacts/:id"               element={<P element={<ContactDetail />} />} />
          <Route path="/contacts/:id/edit"          element={<P element={<ContactForm />} />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
