import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView, View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Joint, SplitId, SetEntry, Exercise, SessionLog, History } from './src/types';
import { SPLITS } from './src/data/programs';
import { getExerciseGuide } from './src/data/exerciseGuides';
import { STORAGE_KEY, weekInfo, today, epley } from './src/utils/training';

export default function App() {
  const [tab,setTab] = useState<'train'|'progress'>('train');
  const [splitId,setSplitId] = useState<SplitId>('synergists');
  const [dayId,setDayId] = useState('push');
  const [week,setWeek] = useState(1);
  const [history,setHistory] = useState<History>({});
  const [entries,setEntries] = useState<Record<string,SetEntry[]>>({});
  const [excluded,setExcluded] = useState<Joint[]>([]);
  const [overrides,setOverrides] = useState<Record<string,string>>({});
  const [loaded,setLoaded] = useState(false);
  const [openGuideId,setOpenGuideId] = useState<string | null>(null);
  const [setCounts,setSetCounts] = useState<Record<string,number>>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const data = JSON.parse(raw);
        setHistory(data.history ?? {});
        setWeek(data.week ?? 1);
        setSplitId(data.splitId ?? 'synergists');
        setDayId(data.dayId ?? 'push');
        setExcluded(data.excluded ?? []);
        setOverrides(data.overrides ?? {});
      } else {
        // Мягкая миграция журнала из первой версии приложения.
        AsyncStorage.getItem('gym-cycle-v1').then(old => {
          if (!old) return;
          const data = JSON.parse(old);
          setHistory(data.history ?? {});
          setWeek(data.week ?? 1);
        });
      }
    }).catch(() => Alert.alert('Ошибка','Не удалось загрузить сохранённые данные.'))
      .finally(() => setLoaded(true));
  },[]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY,JSON.stringify({history,week,splitId,dayId,excluded,overrides})).catch(()=>{});
  },[history,week,splitId,dayId,excluded,overrides,loaded]);

  const split = SPLITS.find(s => s.id === splitId)!;
  const day = split.days.find(d => d.id === dayId) ?? split.days[0];
  const phase = weekInfo[week-1];
  const sessionKey = `${today()}:${splitId}:${day.id}`;
  const exerciseKey = (exercise:Exercise) => `${splitId}:${day.id}:${exercise.id}`;
  const visibleExercises = day.exercises.filter(item => !item.joints.some(j => excluded.includes(j)));

  const currentName = (item:Exercise) => overrides[exerciseKey(item)] ?? item.name;
  const defaultSetCount = (item:Exercise) => week===4 ? Math.max(1,Math.ceil(item.sets/2)) : item.sets;
  const workingSets = (item:Exercise) => setCounts[exerciseKey(item)] ?? defaultSetCount(item);
  const blankEntry = ():SetEntry => ({weight:'',reps:'',rir:String(Number(phase.rir.split('–')[0]))});
  const getEntries = (item:Exercise) => entries[exerciseKey(item)] ??
    Array.from({length: workingSets(item)},blankEntry);

  const setEntry = (item:Exercise,index:number,field:keyof SetEntry,value:string) => {
    const key = exerciseKey(item);
    setEntries(prev => {
      const current = prev[key] ?? Array.from({length: workingSets(item)},blankEntry);
      const extended = [...current];
      while (extended.length <= index) extended.push(blankEntry());
      return {...prev,[key]:extended.map((s,i)=>i===index?{...s,[field]:value.replace(',','.')}:s)};
    });
  };

  const logsForExercise = (item:Exercise) => Object.values(history).flat()
    .filter(log => log.splitId === splitId && log.entries[item.id]?.length && (log.names?.[item.id] ?? item.name) === currentName(item))
    .sort((a,b)=>b.date.localeCompare(a.date));

  const recommendation = (item:Exercise) => {
    const logs = logsForExercise(item);
    const lastSets = logs[0]?.entries[item.id] ?? [];
    if (!lastSets.length) return {weight:null as number|null,text:'Введи стартовый вес'};
    const best = [...lastSets].reverse().find(s=>Number(s.weight)>0&&Number(s.reps)>0);
    if (!best) return {weight:null as number|null,text:'Введи стартовый вес'};
    const passed = lastSets.length >= item.sets && lastSets.every(s=>Number(s.reps)>=item.max && Number(s.rir)>=1);
    const step = /ног|икр|leg|calf/i.test(item.id) ? 5 : 2.5;
    return {weight:Number(best.weight)+(passed?step:0),text:passed?`Все подходы достигли ${item.max} повторений — прибавь ${step} кг`:'Повтори вес и постепенно добери повторения'};
  };

  const requiredSets = visibleExercises.reduce((sum,item)=>sum+workingSets(item),0);
  const completedSets = visibleExercises.reduce((sum,item)=>sum+getEntries(item).slice(0,workingSets(item)).filter(s=>
    Number(s.weight)>0 && Number(s.reps)>=item.min && Number(s.rir)>=Number(phase.rir.split('–')[0])
  ).length,0);
  const workoutPassed = requiredSets>0 && completedSets===requiredSets;

  const saveWorkout = () => {
    const cleaned:Record<string,SetEntry[]> = {};
    visibleExercises.forEach(item=>{
      const sets=getEntries(item).slice(0,workingSets(item)).filter(s=>s.weight.trim()&&s.reps.trim());
      if(sets.length) cleaned[item.id]=sets;
    });
    if(!Object.keys(cleaned).length){Alert.alert('Пока нечего сохранять','Заполни хотя бы один рабочий подход.');return;}
    const names:Record<string,string>={}; visibleExercises.forEach(item=>{names[item.id]=currentName(item);});
    const log:SessionLog={date:today(),dayId:day.id,splitId,week,entries:cleaned,names};
    setHistory(prev=>({...prev,[sessionKey]:[...(prev[sessionKey]??[]).filter(x=>x.date!==today()),log]}));
    Alert.alert(workoutPassed?'Тренировка выполнена по плану':'Тренировка сохранена частично',
      `Зачтено ${completedSets} из ${requiredSets} рабочих подходов. ${workoutPassed?'Целевые показатели выполнены.':'Не повышай вес автоматически: сначала добери цели.'}`);
  };

  const chooseAlternative = (item:Exercise) => {
    const options = item.alternatives.filter(name => name !== currentName(item));
    if (!options.length) { Alert.alert('Нет вариантов','Для этого упражнения пока не добавлены альтернативы.'); return; }
    Alert.alert('Заменить упражнение',`Вместо «${currentName(item)}»`,[
      ...options.slice(0,5).map(name=>({text:name,onPress:()=>{setOverrides(prev=>({...prev,[exerciseKey(item)]:name}));setEntries(prev=>{const next={...prev};delete next[exerciseKey(item)];return next;});}})),
      {text:'Вернуть исходное',onPress:()=>{setOverrides(prev=>{const next={...prev};delete next[exerciseKey(item)];return next;});setEntries(prev=>{const next={...prev};delete next[exerciseKey(item)];return next;});}},
      {text:'Отмена',style:'cancel'},
    ]);
  };

  const changeSplit = (id:SplitId) => {
    const next=SPLITS.find(s=>s.id===id)!;
    setSplitId(id); setDayId(next.days[0].id); setEntries({}); setSetCounts({});
  };
  const toggleJoint = (joint:Joint) => setExcluded(prev=>prev.includes(joint)?prev.filter(x=>x!==joint):[...prev,joint]);

  const allLogs = Object.values(history).flat().sort((a,b)=>b.date.localeCompare(a.date));
  const totalSessions = allLogs.length;
  const estimatedMaxes = useMemo(()=>{
    const values:{name:string;max:number;date:string;split:string}[]=[];
    for(const log of allLogs) for(const [id,sets] of Object.entries(log.entries)){
      const baseItem=SPLITS.flatMap(s=>s.days).flatMap(d=>d.exercises).find(e=>e.id===id);
      if(!baseItem) continue;
      const itemName=log.names?.[id] ?? baseItem.name;
      for(const set of sets){
        const max=epley(Number(set.weight),Number(set.reps),Number(set.rir));
        if(!Number.isFinite(max)||max<=0) continue;
        const existing=values.find(v=>v.name===itemName);
        if(!existing||max>existing.max){
          if(existing){existing.max=max;existing.date=log.date;}
          else values.push({name:itemName,max,date:log.date,split:log.splitId});
        }
      }
    }
    return values.sort((a,b)=>a.name.localeCompare(b.name));
  },[history]);

  const finishWeek=()=>{
    setWeek(week===4?1:week+1);setEntries({});setSetCounts({});
    Alert.alert('Цикл обновлён',week===4?'Начался новый цикл. Повышай веса только там, где выполнил целевые повторы с нужным RIR.':`Следующая неделя: ${weekInfo[week].name}.`);
  };

  if(!loaded) return <SafeAreaView style={styles.safe}><Text style={styles.loading}>Загружаю журнал…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <View style={styles.header}>
      <View><Text style={styles.eyebrow}>GYM TRACKER</Text><Text style={styles.title}>Твой тренировочный цикл</Text></View>
      <View style={styles.weekBadge}><Text style={styles.weekBadgeText}>НЕДЕЛЯ {week}/4</Text></View>
    </View>
    <View style={styles.tabs}>
      <Pressable onPress={()=>setTab('train')} style={[styles.tab,tab==='train'&&styles.activeTab]}><Text style={[styles.tabText,tab==='train'&&styles.activeTabText]}>Тренировка</Text></Pressable>
      <Pressable onPress={()=>setTab('progress')} style={[styles.tab,tab==='progress'&&styles.activeTab]}><Text style={[styles.tabText,tab==='progress'&&styles.activeTabText]}>Прогресс</Text></Pressable>
    </View>
    {tab==='train'?<KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.phaseCard}>
          <View style={styles.phaseTop}><Text style={styles.phaseTitle}>{phase.name} неделя</Text><Text style={styles.rirPill}>RIR {phase.rir}</Text></View>
          <Text style={styles.muted}>{phase.desc} · Оставляй заданный запас повторов.</Text>
          <View style={styles.phaseTrack}>{weekInfo.map((w,i)=><View key={w.name} style={[styles.phaseSegment,i+1<=week&&styles.phaseSegmentActive]}/>)}</View>
        </View>
        <Text style={styles.sectionTitle}>Вариант программы</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.splitScroller}>
          {SPLITS.map(s=><Pressable key={s.id} onPress={()=>changeSplit(s.id)} style={[styles.splitChip,splitId===s.id&&styles.splitChipActive]}><Text style={[styles.splitChipText,splitId===s.id&&styles.splitChipTextActive]}>{s.title}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.muted}>{split.description}</Text>
        <View style={styles.restrictionCard}>
          <Text style={styles.restrictionTitle}>Ограничить нагрузку</Text>
          <Text style={styles.muted}>Упражнения с отмеченными суставами будут скрыты из текущего плана.</Text>
          <View style={styles.restrictionRow}>
            <Pressable onPress={()=>toggleJoint('knees')} style={[styles.restrictionChip,excluded.includes('knees')&&styles.restrictionChipActive]}><Text style={[styles.restrictionText,excluded.includes('knees')&&styles.restrictionTextActive]}>{excluded.includes('knees')?'✓ ':' '}Колени</Text></Pressable>
            <Pressable onPress={()=>toggleJoint('elbows')} style={[styles.restrictionChip,excluded.includes('elbows')&&styles.restrictionChipActive]}><Text style={[styles.restrictionText,excluded.includes('elbows')&&styles.restrictionTextActive]}>{excluded.includes('elbows')?'✓ ':' '}Локти</Text></Pressable>
            {excluded.length>0&&<Pressable onPress={()=>setExcluded([])}><Text style={styles.resetText}>Сбросить</Text></Pressable>}
          </View>
          {excluded.length>0&&<Text style={styles.warningText}>Фильтр не гарантирует отсутствие нагрузки на сустав. Если есть боль или травма, согласуй допустимые движения со специалистом.</Text>}
        </View>
        <View style={styles.dayPicker}>
          {split.days.map((d,i)=><Pressable key={d.id} onPress={()=>{setDayId(d.id);setEntries({});setSetCounts({});}} style={[styles.dayButton,day.id===d.id&&styles.dayButtonActive]}><Text style={[styles.dayButtonText,day.id===d.id&&styles.dayButtonTextActive]}>День {i+1}</Text></Pressable>)}
        </View>
        <Text style={styles.sectionTitle}>{day.title}</Text>
        <Text style={styles.muted}>{day.subtitle} · ориентир 50–60 минут</Text>
        {visibleExercises.length===0&&<View style={styles.emptyCard}><Text style={styles.emptyText}>Все упражнения этого дня исключены выбранными ограничениями. Сними фильтр или выбери другой день.</Text></View>}
        {day.exercises.filter(item=>!item.joints.some(j=>excluded.includes(j))).map((item,index)=>{
          const rec=recommendation(item),sets=getEntries(item),count=workingSets(item);
          const done=sets.slice(0,count).filter(s=>s.weight.trim()&&s.reps.trim()).length;
          const qualified=sets.slice(0,count).filter(s=>Number(s.weight)>0&&Number(s.reps)>=item.min&&Number(s.rir)>=Number(phase.rir.split('–')[0])).length;
          return <View key={item.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHead}>
              <View style={styles.exerciseNum}><Text style={styles.exerciseNumText}>{index+1}</Text></View>
              <View style={{flex:1}}><Text style={styles.exerciseName}>{currentName(item)}</Text><Text style={styles.exerciseMeta}>{count} рабочих подхода · {item.min}–{item.max} повторений · отдых {item.rest}</Text></View>
              <Text style={styles.doneCount}>{done}/{count}</Text>
            </View>
            <View style={styles.exerciseActions}>
              <Pressable onPress={()=>chooseAlternative(item)} style={styles.replaceButton}><Text style={styles.replaceButtonText}>↔ Заменить упражнение</Text></Pressable>
              {item.joints.length>0&&<Text style={styles.jointHint}>{item.joints.map(j=>j==='knees'?'колени':'локти').join(' · ')}</Text>}
            </View>
            <Pressable accessibilityRole="button" accessibilityState={{expanded:openGuideId===item.id}} onPress={()=>setOpenGuideId(openGuideId===item.id?null:item.id)} style={styles.guideToggle}>
              <Text style={styles.guideToggleText}>{openGuideId===item.id?'Скрыть инструкцию':'Как выполнять?'} {openGuideId===item.id?'⌃':'⌄'}</Text>
            </Pressable>
            {openGuideId===item.id&&(()=>{const guide=getExerciseGuide(currentName(item));return <View style={styles.guideCard}>
              <Text style={styles.guideEquipment}>{guide.equipment}</Text>
              <Text style={styles.guideLabel}>НАСТРОЙКА</Text><Text style={styles.guideText}>{guide.setup}</Text>
              {guide.steps.map((step,stepIndex)=><View key={stepIndex} style={styles.guideStep}><Text style={styles.guideStepNumber}>{stepIndex+1}</Text><Text style={styles.guideText}>{step}</Text></View>)}
              <Text style={styles.guideFocus}>Подсказка: {guide.focus}</Text>
            </View>;})()}
            <View style={styles.recommendBox}><Text style={styles.recommendLabel}>СЛЕДУЮЩИЙ РАЗ</Text><Text style={styles.recommendText}>{rec.weight!==null?`${rec.weight} кг`:rec.text}</Text>{rec.weight!==null&&<Text style={styles.recommendHint}>{rec.text}</Text>}</View>
            <View style={styles.setCountRow}><Text style={styles.setCountLabel}>Рабочие подходы</Text><Pressable accessibilityLabel="Уменьшить количество подходов" onPress={()=>setSetCounts(prev=>({...prev,[exerciseKey(item)]:Math.max(1,count-1)}))} style={styles.setCountButton}><Text style={styles.setCountButtonText}>−</Text></Pressable><Text style={styles.setCountValue}>{count}</Text><Pressable accessibilityLabel="Добавить подход" onPress={()=>setSetCounts(prev=>({...prev,[exerciseKey(item)]:Math.min(10,count+1)}))} style={styles.setCountButton}><Text style={styles.setCountButtonText}>+</Text></Pressable></View>
            <Text style={styles.setRule}>Засчитано {qualified}/{count}. Подход засчитывается, если указан вес, выполнено не меньше {item.min} повторений и RIR не ниже {phase.rir.split('–')[0]}.</Text>
            <View style={styles.setHeader}><Text style={styles.setHeaderText}>ПОДХОД</Text><Text style={styles.setHeaderText}>КГ</Text><Text style={styles.setHeaderText}>ПОВТ.</Text><Text style={styles.setHeaderText}>RIR</Text></View>
            {Array.from({length:count},(_,i)=>{
              const entry=sets[i]??blankEntry();
              return <View key={i} style={styles.setRow}><Text style={styles.setNumber}>{i+1}</Text>
                <TextInput style={styles.smallInput} keyboardType="decimal-pad" placeholder="кг" value={entry.weight} onChangeText={v=>setEntry(item,i,'weight',v)}/>
                <TextInput style={styles.smallInput} keyboardType="number-pad" placeholder={`${item.min}–${item.max}`} value={entry.reps} onChangeText={v=>setEntry(item,i,'reps',v)}/>
                <TextInput style={styles.smallInput} keyboardType="number-pad" placeholder="2" value={entry.rir} onChangeText={v=>setEntry(item,i,'rir',v)}/>
              </View>;
            })}
            {done>0&&<Text style={styles.exerciseStatus}>{qualified===count?'✓ Все подходы зачтены':`Заполнено ${done}/${count}; зачтено ${qualified}. Если не достигаешь ${item.min} повторений, снизь вес в следующем подходе.`}</Text>}
          </View>;
        })}
        <View style={styles.completionCard}>
          <View style={styles.completionTop}><Text style={styles.completionTitle}>Выполнение тренировки</Text><Text style={styles.completionValue}>{completedSets}/{requiredSets}</Text></View>
          <View style={styles.completionTrack}><View style={[styles.completionFill,{width:`${requiredSets?completedSets/requiredSets*100:0}%`}]}/></View>
          <Text style={styles.muted}>{workoutPassed?'Все рабочие подходы соответствуют целям недели.':`Счётчик складывает зачтённые подходы упражнений: указан вес, не меньше заданного минимума повторений и RIR не ниже ${phase.rir.split('–')[0]}.`}</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={saveWorkout}><Text style={styles.primaryButtonText}>Сохранить тренировку</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={finishWeek}><Text style={styles.secondaryButtonText}>{week===4?'Завершить разгрузку и начать цикл':'Перейти к следующей неделе'}</Text></Pressable>
        <Text style={styles.footerNote}>Смена программы не удаляет журнал. Альтернативное упражнение сохраняет целевой диапазон подходов и повторений, но история нагрузки для него начнётся отдельно.</Text>
      </ScrollView>
    </KeyboardAvoidingView>:<ScrollView contentContainerStyle={styles.content}>
      <View style={styles.statsRow}><View style={styles.statCard}><Text style={styles.statValue}>{totalSessions}</Text><Text style={styles.statLabel}>Тренировок</Text></View><View style={styles.statCard}><Text style={styles.statValue}>{estimatedMaxes.length}</Text><Text style={styles.statLabel}>Упражнений с историей</Text></View></View>
      <Text style={styles.sectionTitle}>Примерный максимум (1ПМ)</Text><Text style={styles.muted}>Формула Эпли с поправкой на RIR. Это оценка, а не тест реального максимума.</Text>
      {estimatedMaxes.length===0?<View style={styles.emptyCard}><Text style={styles.emptyText}>Сохрани первую тренировку — здесь появится статистика.</Text></View>:estimatedMaxes.map(item=><View key={item.name} style={styles.progressRow}><View style={{flex:1}}><Text style={styles.progressName}>{item.name}</Text><Text style={styles.progressDate}>{item.date}</Text></View><Text style={styles.progressValue}>{item.max.toFixed(1)} кг</Text></View>)}
      <Text style={styles.sectionTitle}>Последние тренировки</Text>
      {allLogs.slice(0,12).map((log,i)=><View key={`${log.date}-${log.splitId}-${log.dayId}-${i}`} style={styles.historyRow}><Text style={styles.historyDate}>{log.date}</Text><Text style={styles.historyName}>{SPLITS.find(s=>s.id===log.splitId)?.title} · {SPLITS.find(s=>s.id===log.splitId)?.days.find(d=>d.id===log.dayId)?.title}</Text><Text style={styles.historyWeek}>Н{log.week}</Text></View>)}
      <Pressable style={styles.dangerButton} onPress={()=>Alert.alert('Удалить историю?','Это действие нельзя отменить.',[{text:'Отмена',style:'cancel'},{text:'Удалить',style:'destructive',onPress:()=>setHistory({})}])}><Text style={styles.dangerText}>Очистить историю</Text></Pressable>
    </ScrollView>}
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#0B0E14'},loading:{color:'#F4F6FA',textAlign:'center',marginTop:80,fontSize:16},
  header:{paddingHorizontal:20,paddingTop:12,paddingBottom:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyebrow:{color:'#8DCEF4',fontSize:10,fontWeight:'800',letterSpacing:2},title:{color:'#F4F6FA',fontSize:21,fontWeight:'800',marginTop:5},
  weekBadge:{backgroundColor:'#1C2D3B',paddingHorizontal:11,paddingVertical:8,borderRadius:10},weekBadgeText:{color:'#8DCEF4',fontSize:11,fontWeight:'800'},
  tabs:{flexDirection:'row',marginHorizontal:20,padding:4,borderRadius:12,backgroundColor:'#171C26',marginBottom:12},
  tab:{flex:1,paddingVertical:10,alignItems:'center',borderRadius:9},activeTab:{backgroundColor:'#29394A'},tabText:{color:'#8993A4',fontWeight:'700'},activeTabText:{color:'#F4F6FA'},
  content:{paddingHorizontal:20,paddingBottom:36},phaseCard:{backgroundColor:'#151D28',borderRadius:16,padding:16,marginBottom:14,borderWidth:1,borderColor:'#26394A'},
  phaseTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},phaseTitle:{color:'#F4F6FA',fontSize:18,fontWeight:'800'},rirPill:{color:'#8DCEF4',backgroundColor:'#20384B',borderRadius:8,paddingHorizontal:10,paddingVertical:6,fontWeight:'800',fontSize:12},
  muted:{color:'#929CAC',fontSize:12,lineHeight:18,marginTop:5},phaseTrack:{flexDirection:'row',gap:5,marginTop:14},phaseSegment:{flex:1,height:5,borderRadius:4,backgroundColor:'#303846'},phaseSegmentActive:{backgroundColor:'#8DCEF4'},
  sectionTitle:{color:'#F4F6FA',fontSize:19,fontWeight:'800',marginTop:14},splitScroller:{marginTop:10,flexGrow:0},splitChip:{paddingHorizontal:13,paddingVertical:10,backgroundColor:'#171C26',borderRadius:10,marginRight:8},splitChipActive:{backgroundColor:'#8DCEF4'},splitChipText:{color:'#9BA5B5',fontSize:12,fontWeight:'700'},splitChipTextActive:{color:'#0B1822'},
  restrictionCard:{backgroundColor:'#151A23',borderRadius:13,padding:13,marginTop:14,borderWidth:1,borderColor:'#283240'},restrictionTitle:{color:'#F4F6FA',fontSize:14,fontWeight:'800'},restrictionRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10},restrictionChip:{borderRadius:9,borderWidth:1,borderColor:'#455366',paddingHorizontal:12,paddingVertical:8},restrictionChipActive:{backgroundColor:'#493337',borderColor:'#A45E64'},restrictionText:{color:'#B6C0CE',fontWeight:'700',fontSize:12},restrictionTextActive:{color:'#FFD4D4'},resetText:{color:'#8DCEF4',fontSize:11,fontWeight:'700',marginLeft:5},warningText:{color:'#D6A3A3',fontSize:10,lineHeight:15,marginTop:10},
  dayPicker:{flexDirection:'row',gap:8,marginTop:14},dayButton:{flex:1,borderRadius:10,backgroundColor:'#171C26',paddingVertical:11,alignItems:'center'},dayButtonActive:{backgroundColor:'#8DCEF4'},dayButtonText:{color:'#9BA5B5',fontWeight:'700',fontSize:12},dayButtonTextActive:{color:'#0B1822'},
  exerciseCard:{backgroundColor:'#151A23',borderRadius:14,padding:13,marginTop:12,borderWidth:1,borderColor:'#242C39'},exerciseHead:{flexDirection:'row',alignItems:'center',gap:10},exerciseNum:{width:27,height:27,borderRadius:8,backgroundColor:'#26394A',alignItems:'center',justifyContent:'center'},exerciseNumText:{color:'#8DCEF4',fontWeight:'800'},exerciseName:{color:'#F4F6FA',fontWeight:'800',fontSize:14},exerciseMeta:{color:'#8993A4',fontSize:11,marginTop:4},doneCount:{color:'#8DCEF4',fontSize:12,fontWeight:'800'},
  exerciseActions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8},replaceButton:{paddingVertical:6,paddingRight:8},replaceButtonText:{color:'#8DCEF4',fontSize:11,fontWeight:'800'},jointHint:{color:'#788597',fontSize:9},
  guideToggle:{alignSelf:'flex-start',paddingVertical:8,paddingHorizontal:10,marginTop:2,borderRadius:8,backgroundColor:'#1B2733'},guideToggleText:{color:'#8DCEF4',fontSize:11,fontWeight:'800'},guideCard:{backgroundColor:'#101820',borderRadius:10,padding:12,marginTop:6,borderWidth:1,borderColor:'#26394A'},guideLabel:{color:'#6F8EA5',fontSize:9,fontWeight:'800',letterSpacing:1,marginBottom:5},guideText:{color:'#C4CED9',fontSize:11,lineHeight:17,flex:1},guideStep:{flexDirection:'row',alignItems:'flex-start',gap:8,marginTop:8},guideStepNumber:{color:'#8DCEF4',fontWeight:'900',fontSize:11,width:16},guideFocus:{color:'#9DB3C5',fontSize:10,lineHeight:15,marginTop:10},
  recommendBox:{backgroundColor:'#101C27',borderRadius:9,padding:10,marginTop:5,marginBottom:10},recommendLabel:{color:'#6F8EA5',fontSize:9,letterSpacing:1,fontWeight:'800'},recommendText:{color:'#BDE5FF',fontSize:14,fontWeight:'800',marginTop:3},recommendHint:{color:'#8C9AA9',fontSize:10,marginTop:3},
  guideEquipment:{color:'#BDE5FF',fontSize:11,fontWeight:'800',lineHeight:16,marginBottom:10},setCountRow:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:10,marginTop:8},setCountLabel:{color:'#AAB5C4',fontSize:11,marginRight:'auto'},setCountButton:{width:30,height:30,borderRadius:8,backgroundColor:'#26394A',alignItems:'center',justifyContent:'center'},setCountButtonText:{color:'#BDE5FF',fontWeight:'900',fontSize:18},setCountValue:{color:'#F4F6FA',fontWeight:'800',fontSize:14,minWidth:18,textAlign:'center'},setRule:{color:'#8291A2',fontSize:10,lineHeight:15,marginTop:7},
  setHeader:{flexDirection:'row',alignItems:'center',paddingHorizontal:3,marginBottom:5},setHeaderText:{color:'#7F8999',fontSize:9,fontWeight:'800',width:'25%',textAlign:'center'},setRow:{flexDirection:'row',alignItems:'center',marginTop:6,gap:6},setNumber:{width:'19%',color:'#8F9AAA',textAlign:'center',fontWeight:'700'},smallInput:{flex:1,minWidth:0,backgroundColor:'#222A36',borderRadius:8,color:'#F4F6FA',textAlign:'center',paddingVertical:9,paddingHorizontal:3,fontSize:13,borderWidth:1,borderColor:'#303B4B'},exerciseStatus:{color:'#83CBA1',fontSize:10,marginTop:9},
  completionCard:{backgroundColor:'#151D28',borderRadius:13,padding:14,marginTop:18,borderWidth:1,borderColor:'#26394A'},completionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},completionTitle:{color:'#EAF0F6',fontSize:13,fontWeight:'800'},completionValue:{color:'#8DCEF4',fontWeight:'900',fontSize:14},completionTrack:{height:6,backgroundColor:'#303846',borderRadius:5,marginTop:10,overflow:'hidden'},completionFill:{height:6,backgroundColor:'#8DCEF4',borderRadius:5},
  primaryButton:{backgroundColor:'#8DCEF4',paddingVertical:15,borderRadius:12,alignItems:'center',marginTop:18},primaryButtonText:{color:'#0B1822',fontWeight:'900',fontSize:14},secondaryButton:{borderColor:'#405064',borderWidth:1,paddingVertical:13,borderRadius:12,alignItems:'center',marginTop:9},secondaryButtonText:{color:'#C2CBD7',fontWeight:'700',fontSize:12},footerNote:{color:'#707C8C',fontSize:10,lineHeight:16,marginTop:12},
  statsRow:{flexDirection:'row',gap:10,marginTop:6},statCard:{flex:1,backgroundColor:'#151A23',padding:16,borderRadius:13},statValue:{color:'#8DCEF4',fontSize:25,fontWeight:'900'},statLabel:{color:'#929CAC',fontSize:11,marginTop:4},emptyCard:{backgroundColor:'#151A23',padding:18,borderRadius:12,marginTop:12},emptyText:{color:'#929CAC',fontSize:13,lineHeight:20},progressRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#151A23',padding:13,borderRadius:10,marginTop:8},progressName:{color:'#EAF0F6',fontSize:12,fontWeight:'700'},progressDate:{color:'#778394',fontSize:10,marginTop:3},progressValue:{color:'#8DCEF4',fontSize:15,fontWeight:'900'},historyRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#151A23',padding:12,borderRadius:9,marginTop:7},historyDate:{color:'#8DCEF4',fontSize:10,width:78,fontWeight:'700'},historyName:{color:'#EAF0F6',fontSize:10,flex:1},historyWeek:{color:'#8993A4',fontSize:10},dangerButton:{padding:14,alignItems:'center',marginTop:22},dangerText:{color:'#E28B8B',fontSize:12,fontWeight:'700'},
});
