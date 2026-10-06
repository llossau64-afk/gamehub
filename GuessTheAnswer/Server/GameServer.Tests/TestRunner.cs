using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using GuessTheAnswer.Server;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Tests
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class TestAttribute : Attribute
    {
    }

    public sealed class AssertionException : Exception
    {
        public AssertionException(string message) : base(message) { }
    }

    public static class Assert
    {
        public static void True(bool condition, string message)
        {
            if (!condition) throw new AssertionException(message);
        }

        public static void Equal<T>(T expected, T actual, string message)
        {
            if (!EqualityComparer<T>.Default.Equals(expected, actual))
                throw new AssertionException(message + " (expected " + expected + ", got " + actual + ")");
        }
    }

    public static class TestData
    {
        static QuestionBank bank;

        public static string DataDirectory
        {
            get
            {
                var dir = new DirectoryInfo(AppContext.BaseDirectory);
                while (dir != null)
                {
                    string candidate = Path.Combine(dir.FullName, "Assets", "GuessTheAnswer", "Resources", "GTA", "Data");
                    if (Directory.Exists(candidate)) return candidate;
                    dir = dir.Parent;
                }
                throw new DirectoryNotFoundException("Question data folder not found.");
            }
        }

        public static QuestionBank Bank => bank ??= QuestionLoader.Load(DataDirectory, _ => { });

        /// <summary>The display index of the correct answer, worked out from the public question data.</summary>
        public static int CorrectIndex(MatchSnapshot s)
        {
            var q = Bank.Get(s.question.id);
            string correct = q.answers[q.correctAnswerIndex];
            for (int i = 0; i < s.question.answers.Length; i++)
            {
                if (s.question.answers[i] == correct) return i;
            }
            throw new AssertionException("Correct answer not among the displayed answers.");
        }

        public static int WrongIndex(MatchSnapshot s)
        {
            int correct = CorrectIndex(s);
            for (int i = 0; i < 4; i++)
            {
                if (i != correct && !s.question.removed[i]) return i;
            }
            throw new AssertionException("No wrong answer left.");
        }
    }

    public static class TestRunner
    {
        public static async Task<int> Main(string[] args)
        {
            int passed = 0, failed = 0;
            string filter = args.Length > 0 ? args[0] : null;
            foreach (var type in typeof(TestRunner).Assembly.GetTypes())
            {
                foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static))
                {
                    if (method.GetCustomAttribute<TestAttribute>() == null) continue;
                    string name = type.Name + "." + method.Name;
                    if (filter != null && !name.Contains(filter, StringComparison.OrdinalIgnoreCase)) continue;
                    try
                    {
                        var result = method.Invoke(null, null);
                        if (result is Task task) await task;
                        passed++;
                        Console.WriteLine("  PASS " + name);
                    }
                    catch (Exception e)
                    {
                        failed++;
                        var inner = e is TargetInvocationException tie && tie.InnerException != null ? tie.InnerException : e;
                        Console.WriteLine("  FAIL " + name + ": " + inner.Message);
                        if (!(inner is AssertionException)) Console.WriteLine(inner.StackTrace);
                    }
                }
            }
            Console.WriteLine();
            Console.WriteLine(passed + " passed, " + failed + " failed");
            return failed == 0 ? 0 : 1;
        }
    }
}
