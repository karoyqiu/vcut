import { zodResolver } from '@hookform/resolvers/zod';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Command } from '@tauri-apps/plugin-shell';
import { Clapperboard, FolderOpen, Timer } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import '@/App.css';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const pad = (value: number, maxLength = 2) => value.toString().padStart(maxLength, '0');

const nts = (seconds: number) => {
  const ms = Math.round((seconds % 1) * 1000);
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 60 / 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
};

const stn = (s: string) => {
  const splitted = s.split(':');
  return splitted.reduce(
    (prev, current, index, array) => prev + parseFloat(current) * 60 ** (array.length - index - 1),
    0,
  );
};

const timeString = z.string().regex(/\d{2}:\d{2}:\d{2}.\d{3}/);
const spanSchema = z
  .object({
    start: timeString,
    end: timeString,
  })
  .refine(
    (values) => {
      const s = stn(values.start);
      const e = stn(values.end);
      return e > s;
    },
    { message: 'End time must be greater than start time.' },
  );

const percent = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const calcEta = (startedAt: number, progress: number) => {
  if (progress === 0) {
    return '--';
  }

  const now = Date.now();
  const elapsed = now - startedAt;
  const ete = (now - startedAt) / progress;
  return nts((ete - elapsed) / 1000);
};

function App() {
  const [inputFilename, setInputFilename] = useState('');
  const [inputDuration, setInputDuration] = useState(0);
  const [outputDuration, setOutputDuration] = useState(100);
  const [progress, setProgress] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const form = useForm<z.infer<typeof spanSchema>>({
    resolver: zodResolver(spanSchema),
    defaultValues: {
      start: '00:00:00.000',
      end: '00:00:00.000',
    },
  });
  const values = form.watch();

  return (
    <main className="flex flex-col gap-4">
      <video
        ref={video}
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onDurationChange={(e) => {
          setInputDuration(e.currentTarget.duration);
          form.reset({ start: '00:00:00.000', end: nts(e.currentTarget.duration) });
        }}
      />
      <div className="flex flex-col gap-4 p-4">
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              const outputFilename = await save({
                defaultPath: inputFilename,
                filters: [
                  {
                    extensions: ['webm', 'mp4', 'wmv', 'mpg', 'mov', 'mpeg', 'm4v', 'avi'],
                    name: 'Video files',
                  },
                ],
              });

              if (outputFilename) {
                setProgress(0);
                setOutputDuration(stn(values.end) - stn(values.start));

                const command = Command.sidecar('binaries/ffmpeg', [
                  '-y',
                  '-progress',
                  'pipe:1',
                  '-nostats',
                  '-loglevel',
                  'error',
                  '-i',
                  inputFilename,
                  '-ss',
                  values.start,
                  '-to',
                  values.end,
                  outputFilename,
                ]);
                command.stdout.on('data', (line) => {
                  const key = 'out_time_us=';

                  if (line.startsWith(key)) {
                    const us = line.substring(key.length);
                    console.log(line, parseFloat(us) / 1000000);
                    setProgress(parseFloat(us) / 1000000);
                  }
                });
                const child = await command.spawn();
                setStartedAt(Date.now());
              }
            })}
          >
            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <div className="flex">
                      <FormControl>
                        <Input
                          {...field}
                          className="rounded-e-none border-e-0 font-mono"
                          type="time"
                          step={0.001}
                          min={'00:00:00.000'}
                          max={values.end}
                          disabled={!video.current?.src}
                        />
                      </FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-s-none"
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={!video.current?.src}
                            onClick={() =>
                              form.setValue('start', nts(video.current?.currentTime ?? 0))
                            }
                          >
                            <Timer />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Set as current time</TooltipContent>
                      </Tooltip>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End time</FormLabel>
                    <div className="flex">
                      <FormControl>
                        <Input
                          {...field}
                          className="rounded-e-none border-e-0 font-mono"
                          type="time"
                          step={0.001}
                          min={values.start}
                          max={nts(inputDuration)}
                          disabled={!video.current?.src}
                        />
                      </FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-s-none"
                            type="button"
                            size="icon"
                            variant="outline"
                            disabled={!video.current?.src}
                            onClick={() =>
                              form.setValue('end', nts(video.current?.currentTime ?? 0))
                            }
                          >
                            <Timer />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Set as current time</TooltipContent>
                      </Tooltip>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={async () => {
                  const file = await open({
                    filters: [
                      {
                        extensions: ['webm', 'mp4', 'wmv', 'mpg', 'mov', 'mpeg', 'm4v', 'avi'],
                        name: 'Video files',
                      },
                    ],
                  });

                  if (file && video.current) {
                    setInputFilename(file);
                    video.current.src = convertFileSrc(file);
                  }
                }}
              >
                <FolderOpen />
                Select video file
              </Button>
              <Button
                type="submit"
                disabled={!form.formState.isValid && form.formState.isSubmitting}
              >
                <Clapperboard />
                Cut
              </Button>
              <div className="flex grow flex-col gap-1">
                <p className="font-mono text-sm text-muted-foreground">{`Progress: ${percent.format(progress / outputDuration)}, ETA ${calcEta(startedAt, progress / outputDuration)}`}</p>
                <Progress max={outputDuration} value={progress} />
              </div>
            </div>
          </form>
        </Form>
      </div>
    </main>
  );
}

export default App;
