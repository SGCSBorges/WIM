/**
 * `useApiForm` is the project-wide convention for forms whose submit handler
 * calls the API. It wraps `react-hook-form`'s `useForm` and adds:
 *
 *   - `submissionError`: the latest error message thrown by the submit
 *     handler, mapped through `getErrorMessage`. Cleared automatically each
 *     time a submit starts.
 *   - `clearSubmissionError`: explicit reset (e.g. when toggling tabs).
 *   - `handleApiSubmit`: a drop-in replacement for `handleSubmit` that
 *     captures rejections from the inner async handler and stashes them in
 *     `submissionError` instead of letting them escape to the console.
 *
 * Pair with the `zodResolver` from `@hookform/resolvers/zod` for schema
 * validation in `defaultValues` + `resolver`.
 */

import { useCallback, useState } from "react";
import {
  useForm,
  FieldValues,
  UseFormProps,
  UseFormReturn,
} from "react-hook-form";
import { getErrorMessage } from "../utils/error";

export interface UseApiFormReturn<
  T extends FieldValues,
> extends UseFormReturn<T> {
  submissionError: string | null;
  clearSubmissionError: () => void;
  handleApiSubmit: (
    onValid: (data: T) => Promise<void> | void
  ) => (e?: React.BaseSyntheticEvent) => Promise<void>;
}

export function useApiForm<T extends FieldValues>(
  options: UseFormProps<T> & { defaultErrorMessage?: string } = {}
): UseApiFormReturn<T> {
  const { defaultErrorMessage, ...rest } = options;
  const form = useForm<T>(rest);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const clearSubmissionError = useCallback(() => {
    setSubmissionError(null);
  }, []);

  const handleApiSubmit = useCallback(
    (onValid: (data: T) => Promise<void> | void) =>
      form.handleSubmit(async (data) => {
        setSubmissionError(null);
        try {
          await onValid(data);
        } catch (err) {
          setSubmissionError(
            getErrorMessage(err, defaultErrorMessage ?? "Something went wrong")
          );
        }
      }),
    [form, defaultErrorMessage]
  );

  return {
    ...form,
    submissionError,
    clearSubmissionError,
    handleApiSubmit,
  };
}
