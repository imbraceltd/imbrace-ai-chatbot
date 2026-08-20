"use client";

import { cn } from "@/lib/utils";
import { Suggestion, Suggestions } from "./suggestion";

function createChoiceKeys(choices: readonly string[]): string[] {
    const counts = new Map<string, number>();
    const keys: string[] = [];

    for (const choice of choices) {
        const current = counts.get(choice) ?? 0;
        const next = current + 1;
        counts.set(choice, next);
        keys.push(next === 1 ? choice : `${choice}-${next}`);
    }

    return keys;
}

export type QuestionChoicesProps = {
    question: string;
    choices: readonly string[];
    onChoose?: (choice: string) => void;
    className?: string;
};

export function QuestionChoices({
    question,
    choices,
    onChoose,
    className,
}: QuestionChoicesProps) {
    const normalizedQuestion = question.trim();
    const normalizedChoices = choices
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

    if (normalizedQuestion.length === 0 && normalizedChoices.length === 0) {
        return null;
    }

    const keys = createChoiceKeys(normalizedChoices);

    return (
        <div className={cn("space-y-3 p-3", className)}>
            {normalizedQuestion.length > 0 && (
                <div className="whitespace-pre-wrap text-sm">{normalizedQuestion}</div>
            )}

            {normalizedChoices.length > 0 && (
                <Suggestions className="gap-2">
                    {normalizedChoices.map((choice, index) => (
                        <Suggestion
                            className="whitespace-normal"
                            key={keys[index]}
                            onClick={() => onChoose?.(choice)}
                            suggestion={choice}
                            variant="secondary"
                        />
                    ))}
                </Suggestions>
            )}
        </div>
    );
}




