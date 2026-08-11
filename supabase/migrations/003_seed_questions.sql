-- ============================================================
-- CodeGuesser - Soru Bankası Seed Verisi
-- Zorluk 1 (Kolay) → 5 (Çok Zor)
-- ============================================================

INSERT INTO public.questions (code_snippet, correct_lang, options, difficulty) VALUES

-- ────────────── ZORLUK 1 ──────────────
('print("Hello, World!")',
 'python', ARRAY['python','javascript','ruby'], 1),

('console.log("Hello, World!")',
 'javascript', ARRAY['javascript','python','java'], 1),

('echo "Hello, World!";',
 'php', ARRAY['php','bash','perl'], 1),

('puts "Hello, World!"',
 'ruby', ARRAY['ruby','python','coffeescript'], 1),

('System.out.println("Hello, World!");',
 'java', ARRAY['java','csharp','kotlin'], 1),

('fmt.Println("Hello, World!")',
 'go', ARRAY['go','rust','swift'], 1),

('print!("Hello, World!");',
 'rust', ARRAY['rust','go','c'], 1),

('print("Hello, World!")',
 'swift', ARRAY['swift','kotlin','java'], 1),

-- ────────────── ZORLUK 2 ──────────────
('const greet = name => `Hello, ${name}!`;',
 'javascript', ARRAY['javascript','typescript','dart'], 2),

('def square(n): return n ** 2',
 'python', ARRAY['python','ruby','julia'], 2),

('let nums: Vec<i32> = vec![1, 2, 3];',
 'rust', ARRAY['rust','go','kotlin'], 2),

('val name: String = "Kiro"',
 'kotlin', ARRAY['kotlin','scala','swift'], 2),

('var name string = "Kiro"',
 'go', ARRAY['go','swift','rust'], 2),

('[1,2,3].map { |x| x * 2 }',
 'ruby', ARRAY['ruby','python','elixir'], 2),

('int[] arr = {1, 2, 3};',
 'java', ARRAY['java','csharp','cpp'], 2),

('var arr = [1, 2, 3];',
 'javascript', ARRAY['javascript','typescript','dart'], 2),

-- ────────────── ZORLUK 3 ──────────────
('SELECT * FROM users WHERE active = true;',
 'sql', ARRAY['sql','graphql','plpgsql'], 3),

('fn main() { let x: u32 = 42; println!("{}", x); }',
 'rust', ARRAY['rust','go','zig'], 3),

('async def fetch(url): return await aiohttp.get(url)',
 'python', ARRAY['python','javascript','julia'], 3),

('const [state, setState] = useState(null);',
 'javascript', ARRAY['javascript','typescript','dart'], 3),

('interface Animal { name: string; speak(): void; }',
 'typescript', ARRAY['typescript','javascript','kotlin'], 3),

('data class User(val id: Int, val name: String)',
 'kotlin', ARRAY['kotlin','scala','swift'], 3),

('(defn add [a b] (+ a b))',
 'clojure', ARRAY['clojure','lisp','racket'], 3),

('SELECT name, COUNT(*) FROM orders GROUP BY name HAVING COUNT(*) > 5;',
 'sql', ARRAY['sql','plpgsql','haskell'], 3),

-- ────────────── ZORLUK 4 ──────────────
('impl<T: Display> fmt::Display for Wrapper<T> {}',
 'rust', ARRAY['rust','cpp','go'], 4),

('type Result<T> = std::result::Result<T, Box<dyn Error>>;',
 'rust', ARRAY['rust','typescript','go'], 4),

('object Singleton { def instance = this }',
 'scala', ARRAY['scala','kotlin','java'], 4),

('proc sql; select * from dataset; run;',
 'sas', ARRAY['sas','sql','r'], 4),

('df %>% filter(age > 18) %>% select(name, score)',
 'r', ARRAY['r','python','julia'], 4),

('@decorator\nasync def view(request): ...',
 'python', ARRAY['python','javascript','ruby'], 4),

('template<typename T> T max(T a, T b) { return a > b ? a : b; }',
 'cpp', ARRAY['cpp','c','rust'], 4),

('(lambda (x) (* x x))',
 'lisp', ARRAY['lisp','clojure','scheme'], 4),

-- ────────────── ZORLUK 5 ──────────────
('{-# LANGUAGE OverloadedStrings #-} module Main where',
 'haskell', ARRAY['haskell','erlang','purescript'], 5),

('SELECT pg_notify(''game_channel'', row_to_json(NEW)::text);',
 'plpgsql', ARRAY['plpgsql','sql','mysql'], 5),

(':- use_module(library(lists)). member(X,[X|_]).',
 'prolog', ARRAY['prolog','lisp','erlang'], 5),

('⟨x : x ∈ ℕ ∧ x mod 2 = 0⟩',
 'agda', ARRAY['agda','coq','idris'], 5),

('IDENTIFICATION DIVISION. PROGRAM-ID. HELLO.',
 'cobol', ARRAY['cobol','fortran','assembly'], 5),

('mov eax, 1\nint 0x80',
 'assembly', ARRAY['assembly','c','cobol'], 5),

('main = do { putStrLn =<< getLine }',
 'haskell', ARRAY['haskell','ocaml','fsharp'], 5),

('receive do {:ok, msg} -> IO.puts(msg) end',
 'elixir', ARRAY['elixir','erlang','ruby'], 5);
