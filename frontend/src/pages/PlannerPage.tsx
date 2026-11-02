import Navbar from '@/components/layout/Navbar';
import TripParametersForm from '@/components/planner/TripParametersForm';

export default function PlannerPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Navbar />
      <main className="pt-20 pb-16">
        <TripParametersForm />
      </main>
    </div>
  );
}
