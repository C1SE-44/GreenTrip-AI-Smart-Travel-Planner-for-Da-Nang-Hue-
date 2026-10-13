const fs = require('fs');
let f = fs.readFileSync('src/components/auth/OnboardingModal.tsx', 'utf8');

// We need to move the useEffect for scrollRef down below the step definition.
// First, extract the scrollRef and useEffect.
const scrollCode = `const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [step]);`;

// Remove it from its current position
f = f.replace(scrollCode, '');

// Insert it after `const [step, setStep] = useState(1);`
f = f.replace(
  "const [step, setStep] = useState(1);", 
  "const [step, setStep] = useState(1);\n  " + scrollCode
);

fs.writeFileSync('src/components/auth/OnboardingModal.tsx', f, 'utf8');
