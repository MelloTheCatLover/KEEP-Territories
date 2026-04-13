import { Rocket } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <div className="bg-neutral-200 border border-neutral-400 rounded-lg shadow-2 p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-4">
          <Rocket className="w-6 h-6 text-brand-500" />
          <h1 className="font-display text-heading-sm font-bold text-neutral-1000">
            Platform Client
          </h1>
        </div>

        <p className="text-sm text-neutral-700 mb-4">
          Design system smoke test. Tokens, fonts, colors all wired up.
        </p>

        <div className="flex items-center gap-4 mb-5">
          <span className="numeric text-heading-md font-semibold text-neutral-900">
            127
          </span>
          <span className="label text-brand-400">STATUS: READY</span>
        </div>

        <button
          className="w-full bg-brand-500 text-neutral-1000 font-medium text-sm py-2 px-4 rounded-sm shadow-2 hover:bg-brand-400 transition-colors duration-fast ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:outline-offset-2"
          onClick={() => console.log('Button works')}
        >
          Launch
        </button>
      </div>
    </div>
  );
}

export default App;
